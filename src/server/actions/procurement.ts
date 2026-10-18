"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { approveOrder, cancelOrderByDealer, confirmReceipt, rejectOrder, submitStockOrder, updateDispatch } from "@/server/services/procurement";
import { approveOrderSchema, dispatchUpdateSchema, receiptSchema, stockOrderSchema } from "@/lib/validation-ops";

// ───────── Dealership side ─────────

export async function submitStockOrderAction(dealershipId: string, input: z.input<typeof stockOrderSchema>) {
  return runAction(async () => {
    const user = await requireUser("procurement.order");
    requireOwnDealership(user, dealershipId);
    const v = stockOrderSchema.parse(input);
    const order = await db.$transaction(async (tx) => {
      const o = await submitStockOrder(tx, { dealershipId, userId: user.id, priority: v.priority, dealerNotes: v.dealerNotes, lines: v.lines });
      await audit({ userId: user.id, dealershipId, action: "procurement.order_submitted", entityType: "ProcurementOrder", entityId: o.id, changes: { number: o.number, priority: v.priority, lines: v.lines.length } }, tx);
      return o;
    });
    return { ok: true as const, data: { id: order.id, number: order.number }, message: `Order PO-${order.number} sent to YADEA procurement.` };
  });
}

export async function cancelStockOrderAction(orderId: string) {
  return runAction(async () => {
    const user = await requireUser("procurement.order");
    const o = await db.procurementOrder.findFirst({ where: { id: orderId, dealershipId: { in: user.memberships.map((m) => m.dealershipId) } } });
    if (!o) throw notFound("Order not found.");
    await db.$transaction(async (tx) => {
      await cancelOrderByDealer(tx, { orderId, dealershipId: o.dealershipId, userId: user.id });
      await audit({ userId: user.id, dealershipId: o.dealershipId, action: "procurement.order_cancelled", entityType: "ProcurementOrder", entityId: orderId, changes: { number: o.number } }, tx);
    });
    return { ok: true as const, message: `Order PO-${o.number} cancelled.` };
  });
}

export async function confirmReceiptAction(input: z.input<typeof receiptSchema>) {
  return runAction(async () => {
    const user = await requireUser("procurement.order");
    const v = receiptSchema.parse(input);
    const o = await db.procurementOrder.findFirst({ where: { id: v.orderId, dealershipId: { in: user.memberships.map((m) => m.dealershipId) } } });
    if (!o) throw notFound("Order not found.");
    const { shortfalls } = await db.$transaction(async (tx) => {
      const out = await confirmReceipt(tx, { orderId: o.id, dealershipId: o.dealershipId, userId: user.id, received: v.received });
      await audit({ userId: user.id, dealershipId: o.dealershipId, action: "procurement.receipt_confirmed", entityType: "ProcurementOrder", entityId: o.id, changes: { number: o.number, shortfalls: out.shortfalls } }, tx);
      return out;
    });
    return { ok: true as const, message: shortfalls.length ? "Receipt recorded with a shortfall — procurement has been told. Stock updated." : "Receipt confirmed — your showroom stock is updated." };
  });
}

// ───────── Procurement side ─────────

export async function approveOrderAction(input: z.input<typeof approveOrderSchema>) {
  return runAction(async () => {
    const user = await requireUser("procurement.manage");
    const v = approveOrderSchema.parse(input);
    const order = await db.procurementOrder.findUnique({ where: { id: v.orderId } });
    if (!order) throw notFound("Order not found.");
    if (v.expectedDeliveryDate && v.expectedDeliveryDate.getTime() < Date.now() - 86400_000) throw new AppError("The expected delivery date can't be in the past.", "VALIDATION", { expectedDeliveryDate: "Choose a future date" });
    const res = await db.$transaction(async (tx) => {
      const out = await approveOrder(tx, { orderId: v.orderId, userId: user.id, prices: v.prices, expectedDeliveryDate: v.expectedDeliveryDate, internalNotes: v.internalNotes });
      await audit({ userId: user.id, dealershipId: order.dealershipId, action: "procurement.order_approved", entityType: "ProcurementOrder", entityId: order.id, changes: { number: order.number, subtotal: Number(out.subtotal), expectedDeliveryDate: v.expectedDeliveryDate?.toISOString() ?? null } }, tx);
      return out;
    });
    return { ok: true as const, message: `PO-${res.number} approved.` };
  });
}

export async function rejectOrderAction(orderId: string, reason: string) {
  return runAction(async () => {
    const user = await requireUser("procurement.manage");
    const r = z.string().trim().min(3, "Give the dealership a reason").max(500).parse(reason);
    const order = await db.procurementOrder.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("Order not found.");
    await db.$transaction(async (tx) => {
      await rejectOrder(tx, { orderId, userId: user.id, reason: r });
      await audit({ userId: user.id, dealershipId: order.dealershipId, action: "procurement.order_rejected", entityType: "ProcurementOrder", entityId: orderId, changes: { number: order.number, reason: r } }, tx);
    });
    return { ok: true as const, message: `PO-${order.number} rejected.` };
  });
}

export async function updateDispatchAction(input: z.input<typeof dispatchUpdateSchema>) {
  return runAction(async () => {
    const user = await requireUser("procurement.manage");
    const v = dispatchUpdateSchema.parse(input);
    const order = await db.procurementOrder.findUnique({ where: { id: v.orderId } });
    if (!order) throw notFound("Order not found.");
    await db.$transaction(async (tx) => {
      await updateDispatch(tx, { orderId: v.orderId, userId: user.id, dispatchStatus: v.dispatchStatus, expectedDeliveryDate: v.expectedDeliveryDate, courier: v.courier, trackingNumber: v.trackingNumber, note: v.note });
      await audit({ userId: user.id, dealershipId: order.dealershipId, action: "procurement.dispatch_updated", entityType: "ProcurementOrder", entityId: order.id, changes: { number: order.number, dispatchStatus: v.dispatchStatus, courier: v.courier ?? null, trackingNumber: v.trackingNumber ?? null } }, tx);
    });
    return { ok: true as const, message: `PO-${order.number} marked ${v.dispatchStatus.replace("_", " ").toLowerCase()}.` };
  });
}
