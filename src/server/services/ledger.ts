import "server-only";
import type { LedgerEntryType, PaymentMethod, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { isoDay } from "@/lib/utils";
import { AppError, notFound } from "@/server/errors";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ledger dates are calendar days (stored at 00:00 UTC), so same-day entries sort by entry number, not by clock time. */
export const ledgerDay = (d: Date = new Date()) => new Date(`${isoDay(d)}T00:00:00.000Z`);
const D = (v: Prisma.Decimal | number | string | null | undefined) => Number(v?.toString() ?? 0);

export type BalanceSummary = { debit: number; credit: number; balance: number; pending: number; pendingCount: number };

/** What a dealership owes YADEA: Σ debit − Σ credit over POSTED entries. Pending payments are reported separately and never reduce the balance. */
export async function dealerBalance(dealershipId: string, client: Tx = db): Promise<BalanceSummary> {
  const [posted, pending] = await Promise.all([
    client.ledgerEntry.aggregate({ where: { dealershipId, status: "POSTED" }, _sum: { debit: true, credit: true } }),
    client.ledgerEntry.aggregate({ where: { dealershipId, status: "PENDING_VERIFICATION" }, _sum: { credit: true }, _count: true }),
  ]);
  const debit = D(posted._sum.debit);
  const credit = D(posted._sum.credit);
  return { debit, credit, balance: round2(debit - credit), pending: D(pending._sum.credit), pendingCount: pending._count };
}

/** Balances for many dealerships at once (central overview). */
export async function balancesByDealership() {
  const [posted, pending] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["dealershipId"], where: { status: "POSTED" }, _sum: { debit: true, credit: true } }),
    db.ledgerEntry.groupBy({ by: ["dealershipId"], where: { status: "PENDING_VERIFICATION" }, _sum: { credit: true }, _count: true }),
  ]);
  const map = new Map<string, BalanceSummary>();
  for (const r of posted) {
    const debit = D(r._sum.debit), credit = D(r._sum.credit);
    map.set(r.dealershipId, { debit, credit, balance: round2(debit - credit), pending: 0, pendingCount: 0 });
  }
  for (const r of pending) {
    const cur = map.get(r.dealershipId) ?? { debit: 0, credit: 0, balance: 0, pending: 0, pendingCount: 0 };
    map.set(r.dealershipId, { ...cur, pending: D(r._sum.credit), pendingCount: r._count });
  }
  return map;
}

export type StatementRow = {
  id: string;
  number: number;
  date: Date;
  type: LedgerEntryType;
  status: "POSTED" | "PENDING_VERIFICATION" | "REJECTED";
  reference: string | null;
  description: string;
  method: PaymentMethod | null;
  debit: number;
  credit: number;
  /** Running balance after this row — only POSTED rows move it. */
  balance: number;
  rejectionReason: string | null;
  hasProof: boolean;
};

/** A dealer statement for a period: opening balance, rows with a running balance, closing balance. */
export async function ledgerStatement(dealershipId: string, range: { from?: Date | null; to?: Date | null } = {}) {
  const from = range.from ?? null;
  const to = range.to ?? null;
  const opening = from
    ? await db.ledgerEntry.aggregate({ where: { dealershipId, status: "POSTED", entryDate: { lt: from } }, _sum: { debit: true, credit: true } })
    : null;
  const openingBalance = opening ? round2(D(opening._sum.debit) - D(opening._sum.credit)) : 0;
  const entries = await db.ledgerEntry.findMany({
    where: { dealershipId, entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
    orderBy: [{ entryDate: "asc" }, { number: "asc" }],
    include: { voucher: { select: { _count: { select: { attachments: true } } } } },
  });
  let running = openingBalance;
  const rows: StatementRow[] = entries.map((e) => {
    if (e.status === "POSTED") running = round2(running + D(e.debit) - D(e.credit));
    return {
      id: e.id, number: e.number, date: e.entryDate, type: e.type, status: e.status, reference: e.reference, description: e.description,
      method: e.method, debit: D(e.debit), credit: D(e.credit), balance: running, rejectionReason: e.rejectionReason,
      hasProof: (e.voucher?._count.attachments ?? 0) > 0,
    };
  });
  const posted = rows.filter((r) => r.status === "POSTED");
  return {
    openingBalance,
    closingBalance: running,
    totalDebit: round2(posted.reduce((s, r) => s + r.debit, 0)),
    totalCredit: round2(posted.reduce((s, r) => s + r.credit, 0)),
    rows,
  };
}

/** Raise the invoice for a dispatched order (idempotent: at most one invoice per order). */
export async function postInvoiceForOrder(tx: Tx, orderId: string, userId: string) {
  const order = await tx.procurementOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.invoiceEntryId) return order.invoiceEntryId;
  const amount = D(order.subtotal);
  if (amount <= 0) return null;
  const entry = await tx.ledgerEntry.create({
    data: {
      dealershipId: order.dealershipId, type: "INVOICE", status: "POSTED", entryDate: ledgerDay(), reference: `PO-${order.number}`, orderId: order.id,
      description: `Invoice for stock order PO-${order.number}`, debit: amount, credit: 0, currency: order.currency, recordedById: userId,
    },
  });
  await tx.procurementOrder.update({ where: { id: order.id }, data: { invoiceEntryId: entry.id } });
  return entry.id;
}

/** A dealership reports a payment it made to YADEA. It waits for procurement to verify it against the proof. */
export async function recordDealerPayment(
  tx: Tx,
  p: { dealershipId: string; userId: string; amount: number; currency: string; entryDate: Date; method: PaymentMethod; reference?: string | null; description?: string | null; orderId?: string | null; voucherId?: string | null },
) {
  if (p.orderId) {
    const o = await tx.procurementOrder.findFirst({ where: { id: p.orderId, dealershipId: p.dealershipId }, select: { id: true } });
    if (!o) throw notFound("That order was not found.");
  }
  return tx.ledgerEntry.create({
    data: {
      dealershipId: p.dealershipId, type: "PAYMENT", status: "PENDING_VERIFICATION", entryDate: p.entryDate, reference: p.reference ?? null,
      description: p.description || "Payment to YADEA", debit: 0, credit: p.amount, currency: p.currency, method: p.method,
      orderId: p.orderId ?? null, voucherId: p.voucherId ?? null, recordedById: p.userId,
    },
  });
}

export async function verifyPayment(tx: Tx, entryId: string, userId: string) {
  const claimed = await tx.ledgerEntry.updateMany({
    where: { id: entryId, type: "PAYMENT", status: "PENDING_VERIFICATION" },
    data: { status: "POSTED", verifiedById: userId, verifiedAt: new Date(), rejectionReason: null },
  });
  if (claimed.count !== 1) throw new AppError("This payment has already been verified or rejected.", "CONFLICT");
  const entry = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.voucherId) await tx.expenseVoucher.updateMany({ where: { id: entry.voucherId, status: "SUBMITTED" }, data: { status: "APPROVED", reviewedById: userId, reviewedAt: new Date() } });
  return entry;
}

export async function rejectPayment(tx: Tx, entryId: string, userId: string, reason: string) {
  const claimed = await tx.ledgerEntry.updateMany({
    where: { id: entryId, type: "PAYMENT", status: "PENDING_VERIFICATION" },
    data: { status: "REJECTED", verifiedById: userId, verifiedAt: new Date(), rejectionReason: reason },
  });
  if (claimed.count !== 1) throw new AppError("This payment has already been verified or rejected.", "CONFLICT");
  const entry = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.voucherId) await tx.expenseVoucher.updateMany({ where: { id: entry.voucherId, status: "SUBMITTED" }, data: { status: "REJECTED", reviewNote: reason, reviewedById: userId, reviewedAt: new Date() } });
  return entry;
}

/** Procurement/accounts posting directly (opening balance, credit note, payment received, adjustment). */
export async function postManualEntry(
  tx: Tx,
  p: { dealershipId: string; userId: string; type: LedgerEntryType; direction: "DEBIT" | "CREDIT"; amount: number; currency: string; entryDate: Date; reference?: string | null; description: string; orderId?: string | null },
) {
  // Invoices raise what is owed (debit); credit notes and payments reduce it (credit). Adjustments may go either way.
  if (p.type === "INVOICE" && p.direction !== "DEBIT") throw new AppError("An invoice increases the balance owed — use a debit.");
  if ((p.type === "CREDIT_NOTE" || p.type === "PAYMENT") && p.direction !== "CREDIT") throw new AppError("This entry type reduces the balance owed — use a credit.");
  if (p.orderId) {
    const o = await tx.procurementOrder.findFirst({ where: { id: p.orderId, dealershipId: p.dealershipId }, select: { id: true } });
    if (!o) throw notFound("That order does not belong to this dealership.");
  }
  return tx.ledgerEntry.create({
    data: {
      dealershipId: p.dealershipId, type: p.type, status: "POSTED", entryDate: p.entryDate, reference: p.reference ?? null, description: p.description,
      debit: p.direction === "DEBIT" ? p.amount : 0, credit: p.direction === "CREDIT" ? p.amount : 0, currency: p.currency, orderId: p.orderId ?? null,
      recordedById: p.userId, verifiedById: p.userId, verifiedAt: new Date(),
    },
  });
}
