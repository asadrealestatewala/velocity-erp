import "server-only";
import type { Prisma, RefundMethod } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { refundForQuantity, round2 } from "@/lib/sales-math";
import { AppError, notFound } from "@/server/errors";
import { adjustStock, type ItemRef } from "@/server/services/inventory";

/** Units of each invoice line that can still come back: invoiced minus everything pending or already refunded. */
export async function returnableByLine(tx: Tx, invoiceId: string) {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId } });
  const used = await tx.salesReturnLine.groupBy({
    by: ["invoiceLineId"],
    where: { salesReturn: { invoiceId, status: { in: ["PENDING", "COMPLETED"] } } },
    _sum: { quantity: true },
  });
  const usedBy = new Map(used.map((u) => [u.invoiceLineId, u._sum.quantity ?? 0]));
  return lines.map((l) => ({ line: l, available: l.quantity - (usedBy.get(l.id) ?? 0) }));
}

export async function requestReturn(
  tx: Tx,
  p: { invoiceId: string; dealershipId: string; userId: string; reason: string; restock: boolean; lines: { invoiceLineId: string; quantity: number }[] },
) {
  await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${p.invoiceId} FOR UPDATE`;
  const inv = await tx.invoice.findFirst({ where: { id: p.invoiceId, dealershipId: p.dealershipId } });
  if (!inv) throw notFound("Invoice not found.");
  if (inv.status === "VOID") throw new AppError("A void invoice can't have returns.", "CONFLICT");
  const wanted = p.lines.filter((l) => l.quantity > 0);
  if (!wanted.length) throw new AppError("Choose at least one item to return.", "VALIDATION", { lines: "Choose at least one item" });

  const avail = new Map((await returnableByLine(tx, inv.id)).map((r) => [r.line.id, r]));
  const rows: { invoiceLineId: string; quantity: number; amount: number }[] = [];
  const seen = new Set<string>();
  for (const w of wanted) {
    const r = avail.get(w.invoiceLineId);
    if (!r || seen.has(w.invoiceLineId)) throw new AppError("One of the lines isn't part of this invoice.", "VALIDATION", { lines: "Invalid line" });
    seen.add(w.invoiceLineId);
    if (w.quantity > r.available) throw new AppError(`Only ${r.available} of "${r.line.name}" can still be returned.`, "VALIDATION", { lines: "Too many" });
    rows.push({ invoiceLineId: w.invoiceLineId, quantity: w.quantity, amount: refundForQuantity({ subtotal: Number(inv.subtotal), discount: Number(inv.discount), taxRate: Number(inv.taxRate) }, Number(r.line.unitPrice), w.quantity) });
  }
  // Never refund more than the invoice total in aggregate (rounding on many partial returns).
  const prior = await tx.salesReturn.aggregate({ where: { invoiceId: inv.id, status: { in: ["PENDING", "COMPLETED"] } }, _sum: { refundAmount: true } });
  const room = round2(Number(inv.total) - Number(prior._sum.refundAmount ?? 0));
  let refundAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  if (refundAmount > room) {
    // Only reachable through rounding drift: trim the last line so the total stays within what was invoiced.
    const over = round2(refundAmount - room);
    const last = rows[rows.length - 1]!;
    last.amount = round2(Math.max(0, last.amount - over));
    refundAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  }
  return tx.salesReturn.create({
    data: { dealershipId: inv.dealershipId, invoiceId: inv.id, reason: p.reason, restock: p.restock, refundAmount, currency: inv.currency, createdById: p.userId, lines: { create: rows } },
    include: { lines: true },
  });
}

/** Approve: records the refund and (if the goods are resaleable) puts them back into the showroom stock — all or nothing. */
export async function approveReturn(tx: Tx, id: string, userId: string, refundMethod: RefundMethod) {
  const claimed = await tx.salesReturn.updateMany({ where: { id, status: "PENDING" }, data: { status: "COMPLETED", processedById: userId, processedAt: new Date(), refundMethod } });
  if (claimed.count !== 1) throw new AppError("This return has already been processed.", "CONFLICT");
  const ret = await tx.salesReturn.findUniqueOrThrow({ where: { id }, include: { lines: { include: { invoiceLine: true } }, invoice: { select: { number: true } } } });
  if (ret.restock) {
    for (const l of ret.lines) {
      const il = l.invoiceLine;
      if (!il.bikeModelId && !il.productId) continue;
      const ref: ItemRef = il.bikeModelId ? { bikeModelId: il.bikeModelId } : { productId: il.productId! };
      await adjustStock(tx, { dealershipId: ret.dealershipId, ref, delta: l.quantity, reason: "RETURN", refType: "SalesReturn", refId: ret.id, note: `Return RET-${ret.number} on INV-${ret.invoice.number}`, userId });
    }
  }
  return ret;
}

export async function rejectReturn(tx: Tx, id: string, userId: string, reason: string | null) {
  const claimed = await tx.salesReturn.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", processedById: userId, processedAt: new Date(), rejectReason: reason } });
  if (claimed.count !== 1) throw new AppError("This return has already been processed.", "CONFLICT");
}

export const returnInclude = {
  lines: { include: { invoiceLine: true } },
  invoice: { select: { id: true, number: true, buyerName: true, buyerNtn: true, taxRate: true, sellerName: true, sellerNtn: true, sellerStrn: true } },
  createdBy: { select: { name: true } },
  processedBy: { select: { name: true } },
  dealership: { select: { name: true, city: { select: { name: true } }, phone: true } },
} satisfies Prisma.SalesReturnInclude;

export const findReturn = (where: Prisma.SalesReturnWhereInput) => db.salesReturn.findFirst({ where, include: returnInclude });
