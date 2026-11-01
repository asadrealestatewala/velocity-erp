import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { documentTotals } from "@/lib/sales-math";
import { AppError, notFound } from "@/server/errors";

/** Raise a tax invoice for a CONFIRMED order. One live invoice per order; seller and buyer identity are frozen on the invoice. */
export async function issueInvoice(
  tx: Tx,
  p: { orderId: string; userId: string; buyerNtn?: string | null; buyerCnic?: string | null; buyerAddress?: string | null; taxRate: number; dueDate?: Date | null; notes?: string | null },
) {
  // Serialise concurrent "issue invoice" clicks on the same order.
  await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${p.orderId} FOR UPDATE`;
  const order = await tx.salesOrder.findUnique({
    where: { id: p.orderId },
    include: { lines: true, dealership: { include: { city: true } }, contact: { select: { firstName: true, lastName: true, phone: true } } },
  });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "CONFIRMED") throw new AppError("Only a confirmed order can be invoiced.", "CONFLICT");
  const live = await tx.invoice.findFirst({ where: { salesOrderId: order.id, status: { not: "VOID" } }, select: { number: true } });
  if (live) throw new AppError(`Order SO-${order.number} already has invoice INV-${live.number}. Void it first to issue a new one.`, "CONFLICT");

  const t = documentTotals(order.lines.map((l) => Number(l.lineTotal)), Number(order.discount), p.taxRate);
  const d = order.dealership;
  const buyerName = order.contact ? [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ") : (order.customerName ?? "Walk-in customer");
  return tx.invoice.create({
    data: {
      dealershipId: order.dealershipId,
      salesOrderId: order.id,
      contactId: order.contactId,
      dueDate: p.dueDate ?? null,
      sellerName: d.legalName || d.name,
      sellerNtn: d.ntn,
      sellerStrn: d.strn,
      sellerAddress: [d.address, d.city.name].filter(Boolean).join(", "),
      buyerName,
      buyerNtn: p.buyerNtn ?? null,
      buyerCnic: p.buyerCnic ?? null,
      buyerAddress: p.buyerAddress ?? null,
      buyerPhone: order.contact?.phone ?? null,
      subtotal: t.subtotal,
      discount: order.discount,
      taxRate: p.taxRate,
      taxAmount: t.taxAmount,
      total: t.total,
      currency: order.currency,
      notes: p.notes ?? null,
      createdById: p.userId,
      lines: { create: order.lines.map((l) => ({ bikeModelId: l.bikeModelId, productId: l.productId, name: l.name, code: l.code, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
    },
    include: { lines: true },
  });
}

export async function markInvoicePaid(tx: Tx, id: string, method: string) {
  const claimed = await tx.invoice.updateMany({ where: { id, status: "ISSUED" }, data: { status: "PAID", paidAt: new Date(), paymentMethod: method } });
  if (claimed.count !== 1) throw new AppError("This invoice is already paid or void.", "CONFLICT");
}

/** Void an invoice. Not possible once goods have been (or are being) returned against it. */
export async function voidInvoice(tx: Tx, id: string, reason: string | null) {
  await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
  const inReturns = await tx.salesReturn.count({ where: { invoiceId: id, status: { in: ["PENDING", "COMPLETED"] } } });
  if (inReturns) throw new AppError("This invoice has returns against it, so it can't be voided.", "CONFLICT");
  const claimed = await tx.invoice.updateMany({ where: { id, status: { in: ["ISSUED", "PAID"] } }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason } });
  if (claimed.count !== 1) throw new AppError("This invoice is already void.", "CONFLICT");
}

export const invoiceInclude = {
  lines: true,
  createdBy: { select: { name: true } },
  salesOrder: { select: { id: true, number: true } },
  dealership: { select: { name: true, city: { select: { name: true } }, phone: true } },
  returns: { orderBy: { createdAt: "desc" }, include: { lines: true, createdBy: { select: { name: true } } } },
} satisfies Prisma.InvoiceInclude;

export const findInvoice = (where: Prisma.InvoiceWhereInput) => db.invoice.findFirst({ where, include: invoiceInclude });
