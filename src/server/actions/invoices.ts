"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { managedDealershipIds, requireUser } from "@/server/authz";
import { audit, diff } from "@/server/audit";
import { forbidden, notFound, runAction } from "@/server/errors";
import { issueInvoice, markInvoicePaid, voidInvoice } from "@/server/services/invoices";
import { dealershipTaxSchema, issueInvoiceSchema } from "@/lib/validation-sales";

export async function issueInvoiceAction(input: z.input<typeof issueInvoiceSchema>) {
  return runAction(async () => {
    const user = await requireUser("invoices.manage");
    const v = issueInvoiceSchema.parse(input);
    const order = await db.salesOrder.findFirst({ where: { id: v.orderId, dealershipId: { in: user.memberships.map((m) => m.dealershipId) } } });
    if (!order) throw notFound("Order not found.");
    const inv = await db.$transaction(async (tx) => {
      const created = await issueInvoice(tx, { orderId: order.id, userId: user.id, buyerNtn: v.buyerNtn, buyerCnic: v.buyerCnic, buyerAddress: v.buyerAddress, taxRate: v.taxRate, dueDate: v.dueDate, notes: v.notes });
      await audit({ userId: user.id, dealershipId: order.dealershipId, action: "invoice.issued", entityType: "Invoice", entityId: created.id, changes: { number: created.number, orderNumber: order.number, total: Number(created.total), taxRate: Number(created.taxRate) } }, tx);
      return created;
    });
    return { ok: true as const, data: { id: inv.id, number: inv.number }, message: `Invoice INV-${inv.number} issued.` };
  });
}

async function ownInvoice(memberships: { dealershipId: string }[], id: string) {
  const inv = await db.invoice.findFirst({ where: { id, dealershipId: { in: memberships.map((m) => m.dealershipId) } } });
  if (!inv) throw notFound("Invoice not found.");
  return inv;
}

export async function markInvoicePaidAction(id: string, method: string) {
  return runAction(async () => {
    const user = await requireUser("invoices.manage");
    const inv = await ownInvoice(user.memberships, id);
    const m = z.string().trim().min(2).max(40).parse(method);
    await db.$transaction(async (tx) => {
      await markInvoicePaid(tx, id, m);
      await audit({ userId: user.id, dealershipId: inv.dealershipId, action: "invoice.paid", entityType: "Invoice", entityId: id, changes: { number: inv.number, method: m, total: Number(inv.total) } }, tx);
    });
    return { ok: true as const, message: `Invoice INV-${inv.number} marked paid.` };
  });
}

export async function voidInvoiceAction(id: string, reason?: string) {
  return runAction(async () => {
    const user = await requireUser("invoices.manage");
    const inv = await ownInvoice(user.memberships, id);
    const r = z.string().trim().max(300).optional().parse(reason || undefined);
    await db.$transaction(async (tx) => {
      await voidInvoice(tx, id, r ?? null);
      await audit({ userId: user.id, dealershipId: inv.dealershipId, action: "invoice.voided", entityType: "Invoice", entityId: id, changes: { number: inv.number, reason: r ?? null } }, tx);
    });
    return { ok: true as const, message: `Invoice INV-${inv.number} voided.` };
  });
}

/** The seller identity printed on invoices. Managers of the dealership only. */
export async function updateDealershipTaxAction(dealershipId: string, input: z.input<typeof dealershipTaxSchema>) {
  return runAction(async () => {
    const user = await requireUser("team.manage");
    if (!managedDealershipIds(user).includes(dealershipId)) throw forbidden();
    const v = dealershipTaxSchema.parse(input);
    const before = await db.dealership.findUniqueOrThrow({ where: { id: dealershipId }, select: { ntn: true, strn: true } });
    await db.dealership.update({ where: { id: dealershipId }, data: { ntn: v.ntn ?? null, strn: v.strn ?? null } });
    await audit({ userId: user.id, dealershipId, action: "dealership.tax_details_updated", entityType: "Dealership", entityId: dealershipId, changes: diff(before, { ntn: v.ntn ?? null, strn: v.strn ?? null }) });
    return { ok: true as const, message: "Tax details saved. They appear on invoices issued from now on." };
  });
}
