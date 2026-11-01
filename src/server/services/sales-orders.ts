import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { fmtMoney, fullName } from "@/lib/utils";
import { parseItemKey } from "@/lib/ops-constants";
import { AppError, notFound } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { adjustStock, resolveItem, warnIfLow, type ItemRef } from "@/server/services/inventory";
import { releaseVehiclesForOrder } from "@/server/services/vehicles";

export type SalesLineInput = { itemKey: string; quantity: number; unitPrice: number };

/** Merge duplicate lines for the same item (quantities add; the later price wins) and resolve item snapshots. */
export async function buildLines(tx: Tx, lines: SalesLineInput[]) {
  const merged = new Map<string, SalesLineInput>();
  for (const l of lines) {
    const prev = merged.get(l.itemKey);
    merged.set(l.itemKey, prev ? { ...l, quantity: prev.quantity + l.quantity } : l);
  }
  const out: { ref: ItemRef; name: string; code: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
  for (const l of merged.values()) {
    const ref = parseItemKey(l.itemKey) as ItemRef | null;
    if (!ref) throw new AppError("One of the items is invalid.");
    const item = await resolveItem(tx, ref);
    out.push({ ref, name: item.name, code: item.code, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: Math.round(l.quantity * l.unitPrice * 100) / 100 });
  }
  return out;
}

export async function createSalesOrder(
  tx: Tx,
  p: {
    dealershipId: string;
    userId: string;
    contactId?: string | null;
    leadId?: string | null;
    customerName?: string | null;
    notes?: string | null;
    discount: number;
    lines: SalesLineInput[];
  },
) {
  const lines = await buildLines(tx, p.lines);
  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  if (p.discount > subtotal) throw new AppError("The discount can't be more than the order subtotal.", "VALIDATION", { discount: "Too high" });
  const contact = p.contactId ? await tx.contact.findUnique({ where: { id: p.contactId }, select: { firstName: true, lastName: true } }) : null;
  const order = await tx.salesOrder.create({
    data: {
      dealershipId: p.dealershipId,
      contactId: p.contactId ?? null,
      leadId: p.leadId ?? null,
      customerName: p.customerName ?? (contact ? fullName(contact) : null),
      notes: p.notes ?? null,
      subtotal,
      discount: p.discount,
      total: Math.round((subtotal - p.discount) * 100) / 100,
      createdById: p.userId,
      lines: {
        create: lines.map((l) => ({
          bikeModelId: l.ref.bikeModelId ?? null,
          productId: l.ref.productId ?? null,
          name: l.name,
          code: l.code,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });
  return order;
}

/** Confirm a draft: deducts stock for every line in one transaction — all or nothing. */
export async function confirmSalesOrder(tx: Tx, orderId: string, userId: string) {
  // Claim the order first: only one concurrent confirm can move DRAFT → CONFIRMED.
  const claimed = await tx.salesOrder.updateMany({ where: { id: orderId, status: "DRAFT" }, data: { status: "CONFIRMED", confirmedById: userId, confirmedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("This order has already been confirmed or cancelled.", "CONFLICT");
  const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
  const touched: string[] = [];
  for (const l of order.lines) {
    const ref: ItemRef = l.bikeModelId ? { bikeModelId: l.bikeModelId } : { productId: l.productId! };
    const { item } = await adjustStock(tx, {
      dealershipId: order.dealershipId, ref, delta: -l.quantity, reason: "SALE", refType: "SalesOrder", refId: order.id,
      note: `Order SO-${order.number}`, userId,
    });
    touched.push(item.id);
  }
  await warnIfLow(tx, order.dealershipId, touched);
  if (order.contactId) {
    await logActivity(tx, {
      type: "ORDER_CONFIRMED",
      title: `Order SO-${order.number} confirmed — ${fmtMoney(order.total.toString(), order.currency)}`,
      body: order.lines.map((l) => `${l.quantity} × ${l.name}`).join(", "),
      contactId: order.contactId,
      leadId: order.leadId,
      dealershipId: order.dealershipId,
      userId,
      metadata: { salesOrderId: order.id },
    });
  }
  return order;
}

/** Cancel an order. A confirmed order puts its stock back (recorded as a separate movement, never an edit). */
export async function cancelSalesOrder(tx: Tx, orderId: string, userId: string, reason?: string | null) {
  const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw notFound("Order not found.");
  const wasConfirmed = order.status === "CONFIRMED";
  const invoice = await tx.invoice.findFirst({ where: { salesOrderId: orderId, status: { not: "VOID" } }, select: { number: true } });
  if (invoice) throw new AppError(`Order SO-${order.number} has invoice INV-${invoice.number}. Void the invoice before cancelling the order.`, "CONFLICT");
  const claimed = await tx.salesOrder.updateMany({
    where: { id: orderId, status: { in: ["DRAFT", "CONFIRMED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null },
  });
  if (claimed.count !== 1) throw new AppError("This order is already cancelled.", "CONFLICT");
  if (wasConfirmed) {
    // Units assigned to this order go back to the showroom (their stock count is restored by the movements below).
    await releaseVehiclesForOrder(tx, orderId);
    for (const l of order.lines) {
      const ref: ItemRef = l.bikeModelId ? { bikeModelId: l.bikeModelId } : { productId: l.productId! };
      await adjustStock(tx, {
        dealershipId: order.dealershipId, ref, delta: l.quantity, reason: "SALE_CANCELLED", refType: "SalesOrder", refId: order.id,
        note: `Order SO-${order.number} cancelled`, userId,
      });
    }
    if (order.contactId) {
      await logActivity(tx, {
        type: "ORDER_CANCELLED",
        title: `Order SO-${order.number} cancelled`,
        body: reason ?? undefined,
        contactId: order.contactId,
        leadId: order.leadId,
        dealershipId: order.dealershipId,
        userId,
        metadata: { salesOrderId: order.id },
      });
    }
  }
  return { order, wasConfirmed };
}

export const salesOrderInclude = {
  lines: true,
  contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
  createdBy: { select: { name: true } },
  confirmedBy: { select: { name: true } },
} satisfies Prisma.SalesOrderInclude;

export async function findSalesOrder(where: Prisma.SalesOrderWhereInput) {
  return db.salesOrder.findFirst({ where, include: salesOrderInclude });
}
