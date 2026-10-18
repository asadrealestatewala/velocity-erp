import "server-only";
import type { DispatchStatus, Prisma, ProcurementStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { parseItemKey, DISPATCH_FLOW } from "@/lib/ops-constants";
import { AppError, notFound } from "@/server/errors";
import { adjustStock, resolveItem, type ItemRef } from "@/server/services/inventory";
import { postInvoiceForOrder } from "@/server/services/ledger";
import { centralUserIdsWith, dealershipUserIds, notify } from "@/server/services/notifications";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | number | string | null | undefined) => Number(v?.toString() ?? 0);

export const orderInclude = {
  dealership: { select: { id: true, name: true, code: true, phone: true, city: { select: { name: true } } } },
  lines: { orderBy: { name: "asc" as const } },
  requestedBy: { select: { id: true, name: true } },
  handledBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  history: { orderBy: { createdAt: "asc" as const }, include: { changedBy: { select: { name: true } } } },
} satisfies Prisma.ProcurementOrderInclude;

async function history(tx: Tx, orderId: string, from: ProcurementStatus | null, to: ProcurementStatus, userId: string | null, note?: string | null, dispatchStatus?: DispatchStatus) {
  await tx.procurementStatusHistory.create({ data: { orderId, fromStatus: from, toStatus: to, dispatchStatus: dispatchStatus ?? null, note: note ?? null, changedById: userId } });
}

/** A dealership submits a stock order. Lines are priced at the catalogue dealer price when one is set. */
export async function submitStockOrder(
  tx: Tx,
  p: { dealershipId: string; userId: string; priority: "NORMAL" | "URGENT"; dealerNotes?: string | null; lines: { itemKey: string; quantity: number }[] },
) {
  const merged = new Map<string, number>();
  for (const l of p.lines) merged.set(l.itemKey, (merged.get(l.itemKey) ?? 0) + l.quantity);
  const lines: { ref: ItemRef; name: string; code: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
  for (const [key, quantity] of merged) {
    const ref = parseItemKey(key) as ItemRef | null;
    if (!ref) throw new AppError("One of the items is invalid.");
    const item = await resolveItem(tx, ref);
    const unitPrice = num(item.dealerPrice);
    lines.push({ ref, name: item.name, code: item.code, quantity, unitPrice, lineTotal: round2(quantity * unitPrice) });
  }
  const order = await tx.procurementOrder.create({
    data: {
      dealershipId: p.dealershipId, priority: p.priority, dealerNotes: p.dealerNotes ?? null, requestedById: p.userId,
      subtotal: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
      lines: { create: lines.map((l) => ({ bikeModelId: l.ref.bikeModelId ?? null, productId: l.ref.productId ?? null, name: l.name, code: l.code, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
    },
    include: { dealership: { select: { name: true } } },
  });
  await history(tx, order.id, null, "SUBMITTED", p.userId, p.dealerNotes);
  await notify(tx, {
    userIds: await centralUserIdsWith(tx, "procurement.manage"),
    type: "PROCUREMENT_NEW",
    title: `${order.priority === "URGENT" ? "Urgent: " : ""}New stock order PO-${order.number} from ${order.dealership.name}`,
    body: lines.map((l) => `${l.quantity} × ${l.name}`).join(", ").slice(0, 300),
    link: { central: `/procurement/orders/${order.id}` },
    entityType: "ProcurementOrder",
    entityId: order.id,
  });
  return order;
}

async function tellDealer(tx: Tx, order: { id: string; number: number; dealershipId: string; requestedById: string }, title: string, body?: string) {
  const managers = await dealershipUserIds(tx, order.dealershipId, true);
  await notify(tx, {
    userIds: [order.requestedById, ...managers],
    type: "PROCUREMENT_UPDATE",
    title,
    body,
    link: { portal: `/portal/stock-orders/${order.id}` },
    entityType: "ProcurementOrder",
    entityId: order.id,
  });
}

/** Procurement approves an order, optionally pricing lines and promising a delivery date. */
export async function approveOrder(tx: Tx, p: { orderId: string; userId: string; prices: Record<string, number>; expectedDeliveryDate?: Date | null; internalNotes?: string | null }) {
  const claimed = await tx.procurementOrder.updateMany({
    where: { id: p.orderId, status: "SUBMITTED" },
    data: { status: "APPROVED", handledById: p.userId, approvedAt: new Date(), expectedDeliveryDate: p.expectedDeliveryDate ?? null, internalNotes: p.internalNotes ?? null },
  });
  if (claimed.count !== 1) throw new AppError("Only a newly received order can be approved.", "CONFLICT");
  const order = await tx.procurementOrder.findUniqueOrThrow({ where: { id: p.orderId }, include: { lines: true } });
  let subtotal = 0;
  for (const l of order.lines) {
    const price = p.prices[l.id] ?? num(l.unitPrice);
    const lineTotal = round2(price * l.quantity);
    subtotal += lineTotal;
    if (price !== num(l.unitPrice)) await tx.procurementOrderLine.update({ where: { id: l.id }, data: { unitPrice: price, lineTotal } });
  }
  await tx.procurementOrder.update({ where: { id: order.id }, data: { subtotal: round2(subtotal) } });
  await history(tx, order.id, "SUBMITTED", "APPROVED", p.userId, p.internalNotes);
  await tellDealer(tx, order, `Stock order PO-${order.number} approved`, p.expectedDeliveryDate ? `Expected delivery: ${p.expectedDeliveryDate.toDateString()}` : "Procurement is preparing your order.");
  return { ...order, subtotal: round2(subtotal) };
}

export async function rejectOrder(tx: Tx, p: { orderId: string; userId: string; reason: string }) {
  const claimed = await tx.procurementOrder.updateMany({
    where: { id: p.orderId, OR: [{ status: "SUBMITTED" }, { status: "APPROVED", dispatchStatus: { in: ["NOT_DISPATCHED", "PACKING"] } }] },
    data: { status: "REJECTED", rejectionReason: p.reason, handledById: p.userId },
  });
  if (claimed.count !== 1) throw new AppError("This order can no longer be rejected.", "CONFLICT");
  const order = await tx.procurementOrder.findUniqueOrThrow({ where: { id: p.orderId } });
  await history(tx, order.id, null, "REJECTED", p.userId, p.reason);
  await tellDealer(tx, order, `Stock order PO-${order.number} was not approved`, p.reason);
  return order;
}

/** The dealership withdraws an order that procurement has not acted on yet. */
export async function cancelOrderByDealer(tx: Tx, p: { orderId: string; dealershipId: string; userId: string }) {
  const claimed = await tx.procurementOrder.updateMany({ where: { id: p.orderId, dealershipId: p.dealershipId, status: "SUBMITTED" }, data: { status: "CANCELLED" } });
  if (claimed.count !== 1) throw new AppError("Only an order that procurement has not approved yet can be cancelled.", "CONFLICT");
  const order = await tx.procurementOrder.findUniqueOrThrow({ where: { id: p.orderId }, include: { dealership: { select: { name: true } } } });
  await history(tx, order.id, "SUBMITTED", "CANCELLED", p.userId, "Cancelled by the dealership");
  await notify(tx, {
    userIds: await centralUserIdsWith(tx, "procurement.manage"),
    type: "PROCUREMENT_UPDATE",
    title: `PO-${order.number} was cancelled by ${order.dealership.name}`,
    link: { central: `/procurement/orders/${order.id}` },
    entityType: "ProcurementOrder",
    entityId: order.id,
  });
  return order;
}

/** Move an approved order forward through packing → dispatched → in transit → delivered; the invoice is raised at dispatch. */
export async function updateDispatch(
  tx: Tx,
  p: { orderId: string; userId: string; dispatchStatus: Exclude<DispatchStatus, "NOT_DISPATCHED">; expectedDeliveryDate?: Date | null; courier?: string | null; trackingNumber?: string | null; note?: string | null },
) {
  const order = await tx.procurementOrder.findUnique({ where: { id: p.orderId } });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "APPROVED") throw new AppError(order.status === "SUBMITTED" ? "Approve the order before dispatching it." : "This order is closed.", "CONFLICT");
  const from = DISPATCH_FLOW.indexOf(order.dispatchStatus);
  const to = DISPATCH_FLOW.indexOf(p.dispatchStatus);
  if (to <= from) throw new AppError(`The order is already ${order.dispatchStatus.replace("_", " ").toLowerCase()}; choose a later step.`, "VALIDATION", { dispatchStatus: "Choose a later step" });

  const delivered = p.dispatchStatus === "DELIVERED";
  const dispatching = to >= DISPATCH_FLOW.indexOf("DISPATCHED");
  const now = new Date();
  // Conditional update: two people updating at once can't both move the same step.
  const claimed = await tx.procurementOrder.updateMany({
    where: { id: order.id, status: "APPROVED", dispatchStatus: order.dispatchStatus },
    data: {
      dispatchStatus: p.dispatchStatus,
      ...(delivered ? { status: "DELIVERED" as const, deliveredAt: now } : {}),
      ...(dispatching && !order.dispatchedAt ? { dispatchedAt: now } : {}),
      ...(p.expectedDeliveryDate !== undefined && p.expectedDeliveryDate !== null ? { expectedDeliveryDate: p.expectedDeliveryDate } : {}),
      ...(p.courier ? { courier: p.courier } : {}),
      ...(p.trackingNumber ? { trackingNumber: p.trackingNumber } : {}),
      handledById: p.userId,
    },
  });
  if (claimed.count !== 1) throw new AppError("The order was updated by someone else. Refresh and try again.", "CONFLICT");
  if (dispatching) await postInvoiceForOrder(tx, order.id, p.userId);
  const updated = await tx.procurementOrder.findUniqueOrThrow({ where: { id: order.id } });
  await history(tx, order.id, order.status, updated.status, p.userId, p.note, p.dispatchStatus);
  const labels: Record<string, string> = { PACKING: "is being packed", DISPATCHED: "has been dispatched", IN_TRANSIT: "is in transit", DELIVERED: "has been delivered — please confirm receipt" };
  await tellDealer(tx, updated, `Stock order PO-${updated.number} ${labels[p.dispatchStatus]}`, [p.courier && `Courier: ${p.courier}`, p.trackingNumber && `Tracking: ${p.trackingNumber}`, updated.expectedDeliveryDate && !delivered && `Expected: ${updated.expectedDeliveryDate.toDateString()}`].filter(Boolean).join(" · ") || undefined);
  return updated;
}

/** The dealership confirms what actually arrived; received quantities are added to its showroom inventory. */
export async function confirmReceipt(tx: Tx, p: { orderId: string; dealershipId: string; userId: string; received: Record<string, number> }) {
  const claimed = await tx.procurementOrder.updateMany({
    where: { id: p.orderId, dealershipId: p.dealershipId, status: "DELIVERED", receivedById: null },
    data: { receivedById: p.userId },
  });
  if (claimed.count !== 1) throw new AppError("This delivery is not awaiting confirmation (it may already have been received).", "CONFLICT");
  const order = await tx.procurementOrder.findUniqueOrThrow({ where: { id: p.orderId }, include: { lines: true, dealership: { select: { name: true } } } });
  const shortfalls: string[] = [];
  for (const l of order.lines) {
    const qty = p.received[l.id] ?? l.quantity;
    if (qty < 0 || qty > l.quantity) throw new AppError(`Received quantity for ${l.name} must be between 0 and ${l.quantity}.`, "VALIDATION", { [`received.${l.id}`]: `0–${l.quantity}` });
    await tx.procurementOrderLine.update({ where: { id: l.id }, data: { quantityReceived: qty } });
    if (qty > 0) {
      const ref: ItemRef = l.bikeModelId ? { bikeModelId: l.bikeModelId } : { productId: l.productId! };
      await adjustStock(tx, { dealershipId: p.dealershipId, ref, delta: qty, reason: "PROCUREMENT_RECEIPT", refType: "ProcurementOrder", refId: order.id, note: `Received on PO-${order.number}`, userId: p.userId });
    }
    if (qty < l.quantity) shortfalls.push(`${l.name}: ${qty} of ${l.quantity}`);
  }
  await notify(tx, {
    userIds: await centralUserIdsWith(tx, "procurement.manage"),
    type: "PROCUREMENT_UPDATE",
    title: shortfalls.length ? `${order.dealership.name} reported a short delivery on PO-${order.number}` : `${order.dealership.name} confirmed receipt of PO-${order.number}`,
    body: shortfalls.join("; ") || undefined,
    link: { central: `/procurement/orders/${order.id}` },
    entityType: "ProcurementOrder",
    entityId: order.id,
  });
  return { order, shortfalls };
}

export async function procurementStats(dealershipId?: string) {
  const base: Prisma.ProcurementOrderWhereInput = dealershipId ? { dealershipId } : {};
  const today = new Date(new Date().toDateString());
  const [byStatus, byDispatch, overdue, awaitingReceipt] = await Promise.all([
    db.procurementOrder.groupBy({ by: ["status"], where: base, _count: true }),
    db.procurementOrder.groupBy({ by: ["dispatchStatus"], where: { ...base, status: "APPROVED" }, _count: true }),
    db.procurementOrder.count({ where: { ...base, status: "APPROVED", expectedDeliveryDate: { lt: today } } }),
    db.procurementOrder.count({ where: { ...base, status: "DELIVERED", receivedById: null } }),
  ]);
  const s = (k: ProcurementStatus) => byStatus.find((r) => r.status === k)?._count ?? 0;
  const d = (k: DispatchStatus) => byDispatch.find((r) => r.dispatchStatus === k)?._count ?? 0;
  return {
    total: byStatus.reduce((n, r) => n + r._count, 0),
    received: s("SUBMITTED"),
    approved: s("APPROVED"),
    delivered: s("DELIVERED"),
    rejected: s("REJECTED"),
    cancelled: s("CANCELLED"),
    notDispatched: d("NOT_DISPATCHED"),
    packing: d("PACKING"),
    dispatched: d("DISPATCHED"),
    inTransit: d("IN_TRANSIT"),
    overdue,
    awaitingReceipt,
  };
}
export type ProcurementStats = Awaited<ReturnType<typeof procurementStats>>;
