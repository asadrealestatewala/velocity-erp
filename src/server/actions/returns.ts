"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { notFound, runAction } from "@/server/errors";
import { approveReturn, rejectReturn, requestReturn } from "@/server/services/returns";
import { approveReturnSchema, returnSchema } from "@/lib/validation-sales";

export async function requestReturnAction(input: z.input<typeof returnSchema>) {
  return runAction(async () => {
    const user = await requireUser("returns.manage");
    const v = returnSchema.parse(input);
    const inv = await db.invoice.findFirst({ where: { id: v.invoiceId, dealershipId: { in: user.memberships.map((m) => m.dealershipId) } } });
    if (!inv) throw notFound("Invoice not found.");
    const ret = await db.$transaction(async (tx) => {
      const created = await requestReturn(tx, { invoiceId: inv.id, dealershipId: inv.dealershipId, userId: user.id, reason: v.reason, restock: v.restock, lines: v.lines });
      await audit({ userId: user.id, dealershipId: inv.dealershipId, action: "return.requested", entityType: "SalesReturn", entityId: created.id, changes: { number: created.number, invoiceNumber: inv.number, refundAmount: Number(created.refundAmount), restock: v.restock } }, tx);
      return created;
    });
    return { ok: true as const, data: { id: ret.id, number: ret.number }, message: `Return RET-${ret.number} recorded — awaiting approval.` };
  });
}

async function ownReturn(memberships: { dealershipId: string }[], id: string) {
  const r = await db.salesReturn.findFirst({ where: { id, dealershipId: { in: memberships.map((m) => m.dealershipId) } } });
  if (!r) throw notFound("Return not found.");
  return r;
}

/** Approving puts the items back on the shelf (if restocking) and records the refund. Separate permission from raising the return. */
export async function approveReturnAction(returnId: string, refundMethod: string) {
  return runAction(async () => {
    const user = await requireUser("returns.approve");
    const v = approveReturnSchema.parse({ returnId, refundMethod });
    const r = await ownReturn(user.memberships, v.returnId);
    await db.$transaction(async (tx) => {
      await approveReturn(tx, r.id, user.id, v.refundMethod);
      await audit({ userId: user.id, dealershipId: r.dealershipId, action: "return.approved", entityType: "SalesReturn", entityId: r.id, changes: { number: r.number, refundAmount: Number(r.refundAmount), refundMethod: v.refundMethod, restocked: r.restock } }, tx);
    });
    return { ok: true as const, message: `Return RET-${r.number} approved — refund of ${Number(r.refundAmount).toLocaleString()} ${r.currency} recorded${r.restock ? " and stock restored" : ""}.` };
  });
}

export async function rejectReturnAction(returnId: string, reason?: string) {
  return runAction(async () => {
    const user = await requireUser("returns.approve");
    const r = await ownReturn(user.memberships, returnId);
    const why = z.string().trim().max(300).optional().parse(reason || undefined);
    await db.$transaction(async (tx) => {
      await rejectReturn(tx, r.id, user.id, why ?? null);
      await audit({ userId: user.id, dealershipId: r.dealershipId, action: "return.rejected", entityType: "SalesReturn", entityId: r.id, changes: { number: r.number, reason: why ?? null } }, tx);
    });
    return { ok: true as const, message: `Return RET-${r.number} rejected.` };
  });
}
