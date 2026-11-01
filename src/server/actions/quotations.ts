"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { accessibleContact, accessibleLead, requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { convertQuotation, createQuotation, respondToQuotation } from "@/server/services/quotations";
import { quotationSchema } from "@/lib/validation-sales";

export async function createQuotationAction(dealershipId: string, input: z.input<typeof quotationSchema>) {
  return runAction(async () => {
    const user = await requireUser("quotations.manage");
    requireOwnDealership(user, dealershipId);
    const v = quotationSchema.parse(input);
    if (v.contactId) await accessibleContact(user, v.contactId);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    if (lead && lead.dealershipId !== dealershipId) throw new AppError("That lead belongs to a different dealership.");
    const q = await db.$transaction(async (tx) => {
      const created = await createQuotation(tx, {
        dealershipId, userId: user.id, contactId: v.contactId ?? lead?.contactId ?? null, leadId: lead?.id ?? null,
        customerName: v.customerName, notes: v.notes, discount: v.discount, validUntil: v.validUntil, markSent: v.markSent, lines: v.lines,
      });
      await audit({ userId: user.id, dealershipId, action: "quotation.created", entityType: "Quotation", entityId: created.id, changes: { number: created.number, total: Number(created.total) } }, tx);
      return created;
    });
    return { ok: true as const, data: { id: q.id, number: q.number }, message: `Quotation QT-${q.number} saved.` };
  });
}

async function ownQuotation(memberships: { dealershipId: string }[], id: string) {
  const q = await db.quotation.findFirst({ where: { id, dealershipId: { in: memberships.map((m) => m.dealershipId) } } });
  if (!q) throw notFound("Quotation not found.");
  return q;
}

export async function updateQuotationStatusAction(id: string, to: "SENT" | "ACCEPTED" | "REJECTED", reason?: string) {
  return runAction(async () => {
    const user = await requireUser("quotations.manage");
    const q = await ownQuotation(user.memberships, id);
    const status = z.enum(["SENT", "ACCEPTED", "REJECTED"]).parse(to);
    const r = z.string().trim().max(300).optional().parse(reason || undefined);
    await db.$transaction(async (tx) => {
      await respondToQuotation(tx, id, status, r);
      await audit({ userId: user.id, dealershipId: q.dealershipId, action: `quotation.${status.toLowerCase()}`, entityType: "Quotation", entityId: id, changes: { number: q.number, reason: r ?? null } }, tx);
    });
    return { ok: true as const, message: `Quotation QT-${q.number} marked ${status.toLowerCase()}.` };
  });
}

/** Creates a draft customer order from the quotation. Stock is untouched until that order is confirmed. */
export async function convertQuotationAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("quotations.manage");
    // Converting creates an order, so the user needs that permission too.
    await requireUser("salesorders.manage");
    const q = await ownQuotation(user.memberships, id);
    const out = await db.$transaction(async (tx) => {
      const res = await convertQuotation(tx, id, user.id);
      await audit({ userId: user.id, dealershipId: q.dealershipId, action: "quotation.converted", entityType: "Quotation", entityId: id, changes: { number: q.number, salesOrderId: res.order.id, orderNumber: res.order.number } }, tx);
      await audit({ userId: user.id, dealershipId: q.dealershipId, action: "salesorder.created", entityType: "SalesOrder", entityId: res.order.id, changes: { number: res.order.number, total: Number(res.order.total), fromQuotation: q.number } }, tx);
      return res.order;
    });
    return { ok: true as const, data: { id: out.id, number: out.number }, message: `Draft order SO-${out.number} created from QT-${q.number}.` };
  });
}
