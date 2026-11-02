"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { runAction } from "@/server/errors";
import { cancelCount, completeCount, saveCounts, startCount } from "@/server/services/stock-counts";
import { stockCountSaveSchema, stockCountStartSchema } from "@/lib/validation-ops";
import type { z } from "zod";

export async function startStockCountAction(dealershipId: string, input: z.input<typeof stockCountStartSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = stockCountStartSchema.parse(input);
    const c = await db.$transaction(async (tx) => {
      const c = await startCount(tx, { dealershipId, title: v.title, note: v.note, userId: user.id });
      await audit({ userId: user.id, dealershipId, action: "inventory.count_started", entityType: "StockCount", entityId: c.id, changes: { number: c.number } }, tx);
      return c;
    });
    revalidatePath("/portal/stock-counts");
    return { ok: true as const, data: { id: c.id }, message: `Stock count SC-${c.number} started.` };
  });
}

export async function saveStockCountAction(dealershipId: string, input: z.input<typeof stockCountSaveSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = stockCountSaveSchema.parse(input);
    await db.$transaction((tx) => saveCounts(tx, { countId: v.countId, dealershipId, entries: v.entries }));
    revalidatePath(`/portal/stock-counts/${v.countId}`);
    return { ok: true as const, message: "Counts saved." };
  });
}

/** Apply the variances to the showroom's stock. */
export async function completeStockCountAction(dealershipId: string, countId: string) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const r = await db.$transaction(async (tx) => {
      const r = await completeCount(tx, { countId, dealershipId, userId: user.id });
      await audit({ userId: user.id, dealershipId, action: "inventory.count_completed", entityType: "StockCount", entityId: countId, changes: { number: r.count.number, counted: r.counted, of: r.total, variances: r.variances } }, tx);
      return r;
    });
    revalidatePath("/portal/stock-counts");
    return { ok: true as const, message: r.variances.length ? `Count closed — ${r.variances.length} item(s) corrected.` : "Count closed — everything matched." };
  });
}

export async function cancelStockCountAction(dealershipId: string, countId: string) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    await db.$transaction(async (tx) => {
      const c = await cancelCount(tx, { countId, dealershipId });
      await audit({ userId: user.id, dealershipId, action: "inventory.count_cancelled", entityType: "StockCount", entityId: c.id, changes: { number: c.number } }, tx);
    });
    revalidatePath("/portal/stock-counts");
    return { ok: true as const, message: "Stock count cancelled — no stock was changed." };
  });
}
