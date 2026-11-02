"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { runAction } from "@/server/errors";
import { closeTransfer, receiveTransfer, sendTransfer } from "@/server/services/stock-transfers";
import { stockTransferSchema, transferCloseSchema, transferReceiveSchema } from "@/lib/validation-ops";
import type { z } from "zod";

/** Send stock from your showroom to another outlet of your group. */
export async function sendTransferAction(dealershipId: string, input: z.input<typeof stockTransferSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = stockTransferSchema.parse(input);
    const t = await db.$transaction(async (tx) => {
      const t = await sendTransfer(tx, { fromDealershipId: dealershipId, toDealershipId: v.toDealershipId, lines: v.lines, note: v.note, userId: user.id });
      await audit({ userId: user.id, dealershipId, action: "inventory.transfer_sent", entityType: "StockTransfer", entityId: t.id, changes: { number: t.number, to: v.toDealershipId, units: t.lines.reduce((n, l) => n + l.quantity, 0) } }, tx);
      return t;
    });
    revalidatePath("/portal/stock-transfers");
    return { ok: true as const, data: { id: t.id }, message: `Transfer TR-${t.number} sent.` };
  });
}

/** The receiving outlet confirms what arrived. */
export async function receiveTransferAction(dealershipId: string, input: z.input<typeof transferReceiveSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = transferReceiveSchema.parse(input);
    const r = await db.$transaction(async (tx) => {
      const r = await receiveTransfer(tx, { transferId: v.transferId, toDealershipId: dealershipId, received: v.received, userId: user.id });
      await audit({ userId: user.id, dealershipId, action: "inventory.transfer_received", entityType: "StockTransfer", entityId: v.transferId, changes: { number: r.transfer.number, short: r.short } }, tx);
      return r;
    });
    revalidatePath("/portal/stock-transfers");
    return { ok: true as const, message: r.short ? `Received. ${r.short} short unit(s) went back to the sender.` : "Received — your stock is updated." };
  });
}

/** Sender cancels (CANCEL) or receiver refuses (REJECT) a transfer that is still on its way. */
export async function closeTransferAction(dealershipId: string, input: z.input<typeof transferCloseSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = transferCloseSchema.parse(input);
    await db.$transaction(async (tx) => {
      const t = await closeTransfer(tx, { transferId: v.transferId, dealershipId, kind: v.kind, reason: v.reason, userId: user.id });
      await audit({ userId: user.id, dealershipId, action: v.kind === "CANCEL" ? "inventory.transfer_cancelled" : "inventory.transfer_rejected", entityType: "StockTransfer", entityId: t.id, changes: { number: t.number, reason: v.reason ?? null } }, tx);
    });
    revalidatePath("/portal/stock-transfers");
    return { ok: true as const, message: v.kind === "CANCEL" ? "Transfer cancelled — the stock is back in your inventory." : "Transfer rejected — the stock went back to the sender." };
  });
}
