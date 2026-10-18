"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/server/authz";
import { accessibleContact, accessibleLead, requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { cancelSalesOrder, confirmSalesOrder, createSalesOrder } from "@/server/services/sales-orders";
import { salesOrderSchema } from "@/lib/validation-ops";
import { fullName, normalizePhone } from "@/lib/utils";

/** Create a customer's order at the showroom; optionally confirm it straight away (which deducts stock). */
export async function createSalesOrderAction(dealershipId: string, input: z.input<typeof salesOrderSchema>) {
  return runAction(async () => {
    const user = await requireUser("salesorders.manage");
    requireOwnDealership(user, dealershipId);
    const v = salesOrderSchema.parse(input);
    if (v.contactId) await accessibleContact(user, v.contactId);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    if (lead && lead.dealershipId !== dealershipId) throw new AppError("That lead belongs to a different dealership.");
    const order = await db.$transaction(async (tx) => {
      const created = await createSalesOrder(tx, {
        dealershipId, userId: user.id, contactId: v.contactId ?? lead?.contactId ?? null, leadId: lead?.id ?? null,
        customerName: v.customerName, notes: v.notes, discount: v.discount, lines: v.lines,
      });
      await audit({ userId: user.id, dealershipId, action: "salesorder.created", entityType: "SalesOrder", entityId: created.id, changes: { number: created.number, total: Number(created.total) } }, tx);
      if (v.confirmNow) {
        await confirmSalesOrder(tx, created.id, user.id);
        await audit({ userId: user.id, dealershipId, action: "salesorder.confirmed", entityType: "SalesOrder", entityId: created.id, changes: { number: created.number } }, tx);
      }
      return created;
    });
    return { ok: true as const, data: { id: order.id, number: order.number }, message: v.confirmNow ? `Order SO-${order.number} confirmed — stock updated.` : `Draft order SO-${order.number} saved.` };
  });
}

async function ownOrder(userId: string, dealershipIds: string[], id: string) {
  const o = await db.salesOrder.findFirst({ where: { id, dealershipId: { in: dealershipIds } } });
  if (!o) throw notFound("Order not found.");
  void userId;
  return o;
}

export async function confirmSalesOrderAction(orderId: string) {
  return runAction(async () => {
    const user = await requireUser("salesorders.manage");
    const o = await ownOrder(user.id, user.memberships.map((m) => m.dealershipId), orderId);
    await db.$transaction(async (tx) => {
      await confirmSalesOrder(tx, orderId, user.id);
      await audit({ userId: user.id, dealershipId: o.dealershipId, action: "salesorder.confirmed", entityType: "SalesOrder", entityId: orderId, changes: { number: o.number } }, tx);
    });
    return { ok: true as const, message: `Order SO-${o.number} confirmed — stock updated.` };
  });
}

export async function cancelSalesOrderAction(orderId: string, reason?: string) {
  return runAction(async () => {
    const user = await requireUser("salesorders.manage");
    const o = await ownOrder(user.id, user.memberships.map((m) => m.dealershipId), orderId);
    const r = z.string().trim().max(300).optional().parse(reason || undefined);
    const { wasConfirmed } = await db.$transaction(async (tx) => {
      const out = await cancelSalesOrder(tx, orderId, user.id, r);
      await audit({ userId: user.id, dealershipId: o.dealershipId, action: "salesorder.cancelled", entityType: "SalesOrder", entityId: orderId, changes: { number: o.number, stockRestored: out.wasConfirmed, reason: r ?? null } }, tx);
      return out;
    });
    return { ok: true as const, message: wasConfirmed ? `Order SO-${o.number} cancelled — stock restored.` : `Order SO-${o.number} cancelled.` };
  });
}

/** Contacts the signed-in dealership user may attach to an order (same scope as the contacts list). */
export async function searchCustomersAction(q: string) {
  return runAction(async () => {
    const user = await requireUser("salesorders.manage");
    const term = q.trim();
    if (term.length < 2) return [];
    const phone = normalizePhone(term);
    const rows = await db.contact.findMany({
      where: {
        AND: [
          contactScope(user),
          { isArchived: false },
          { OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            ...(phone ? [{ phoneNormalized: { contains: phone } }] : []),
          ] },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    return rows.map((c) => ({ id: c.id, name: fullName(c), phone: c.phone }));
  });
}
