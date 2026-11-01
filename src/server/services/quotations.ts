import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { round2 } from "@/lib/sales-math";
import { AppError, notFound } from "@/server/errors";
import { buildLines, createSalesOrder, type SalesLineInput } from "@/server/services/sales-orders";

export async function createQuotation(
  tx: Tx,
  p: { dealershipId: string; userId: string; contactId?: string | null; leadId?: string | null; customerName?: string | null; notes?: string | null; discount: number; validUntil?: Date | null; markSent?: boolean; lines: SalesLineInput[] },
) {
  const lines = await buildLines(tx, p.lines);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (p.discount > subtotal) throw new AppError("The discount can't be more than the quotation subtotal.", "VALIDATION", { discount: "Too high" });
  const contact = p.contactId ? await tx.contact.findUnique({ where: { id: p.contactId }, select: { firstName: true, lastName: true } }) : null;
  return tx.quotation.create({
    data: {
      dealershipId: p.dealershipId,
      contactId: p.contactId ?? null,
      leadId: p.leadId ?? null,
      customerName: p.customerName ?? (contact ? fullName(contact) : null),
      notes: p.notes ?? null,
      validUntil: p.validUntil ?? null,
      status: p.markSent ? "SENT" : "DRAFT",
      sentAt: p.markSent ? new Date() : null,
      subtotal,
      discount: p.discount,
      total: round2(subtotal - p.discount),
      createdById: p.userId,
      lines: { create: lines.map((l) => ({ bikeModelId: l.ref.bikeModelId ?? null, productId: l.ref.productId ?? null, name: l.name, code: l.code, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
    },
    include: { lines: true },
  });
}

export const isExpired = (q: { validUntil: Date | null; status: string }, now = new Date()) =>
  !!q.validUntil && q.validUntil.getTime() < now.getTime() && ["DRAFT", "SENT", "ACCEPTED"].includes(q.status);

/** DRAFT → SENT, SENT/DRAFT → ACCEPTED or REJECTED. Each move is a conditional update so concurrent clicks can't double-apply. */
export async function respondToQuotation(tx: Tx, id: string, to: "SENT" | "ACCEPTED" | "REJECTED", reason?: string | null) {
  const from = to === "SENT" ? ["DRAFT"] : ["DRAFT", "SENT"];
  const data: Prisma.QuotationUpdateManyMutationInput =
    to === "SENT" ? { status: "SENT", sentAt: new Date() } : { status: to, respondedAt: new Date(), rejectReason: to === "REJECTED" ? (reason ?? null) : null };
  const claimed = await tx.quotation.updateMany({ where: { id, status: { in: from as ("DRAFT" | "SENT")[] } }, data });
  if (claimed.count !== 1) throw new AppError("This quotation can't be moved to that status any more.", "CONFLICT");
}

/** Turn a quotation into a DRAFT customer order with the same lines and prices (stock is only deducted when the order is confirmed). */
export async function convertQuotation(tx: Tx, id: string, userId: string) {
  const q = await tx.quotation.findUnique({ where: { id }, include: { lines: true } });
  if (!q) throw notFound("Quotation not found.");
  if (isExpired(q)) throw new AppError("This quotation has expired. Create a new one or extend its validity first.", "CONFLICT");
  const claimed = await tx.quotation.updateMany({ where: { id, status: { in: ["DRAFT", "SENT", "ACCEPTED"] }, convertedOrderId: null }, data: { status: "CONVERTED", respondedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("This quotation was already converted or rejected.", "CONFLICT");
  const order = await createSalesOrder(tx, {
    dealershipId: q.dealershipId, userId, contactId: q.contactId, leadId: q.leadId, customerName: q.customerName,
    notes: [q.notes, `From quotation QT-${q.number}`].filter(Boolean).join("\n"), discount: Number(q.discount),
    lines: q.lines.map((l) => ({ itemKey: l.bikeModelId ? `B:${l.bikeModelId}` : `P:${l.productId}`, quantity: l.quantity, unitPrice: Number(l.unitPrice) })),
  });
  await tx.quotation.update({ where: { id }, data: { convertedOrderId: order.id } });
  return { quotation: q, order };
}

export const quotationInclude = {
  lines: true,
  contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
  createdBy: { select: { name: true } },
  dealership: { select: { name: true, address: true, phone: true, ntn: true, strn: true, city: { select: { name: true } } } },
} satisfies Prisma.QuotationInclude;

export const findQuotation = (where: Prisma.QuotationWhereInput) => db.quotation.findFirst({ where, include: quotationInclude });
