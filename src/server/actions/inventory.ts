"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { adjustStock, ensureItem, resolveItem, warnIfLow, type ItemRef } from "@/server/services/inventory";
import { parseItemKey } from "@/lib/ops-constants";
import { reorderLevelSchema, stockAddSchema, stockAdjustSchema } from "@/lib/validation-ops";
import type { z } from "zod";

/** Put a bike model or spare part into the showroom's inventory (with its opening quantity). */
export async function addStockItemAction(dealershipId: string, input: z.input<typeof stockAddSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = stockAddSchema.parse(input);
    const ref = parseItemKey(v.itemKey) as ItemRef | null;
    if (!ref) throw new AppError("Choose an item.", "VALIDATION", { itemKey: "Required" });
    await db.$transaction(async (tx) => {
      const meta = await resolveItem(tx, ref);
      const existing = await ensureItem(tx, dealershipId, ref);
      if (existing.quantity > 0 || (await tx.inventoryMovement.count({ where: { itemId: existing.id } })) > 0) {
        throw new AppError(`${meta.name} is already in your showroom inventory — use “Adjust stock” instead.`, "CONFLICT");
      }
      await tx.inventoryItem.update({ where: { id: existing.id }, data: { reorderLevel: v.reorderLevel } });
      if (v.quantity > 0) {
        await adjustStock(tx, { dealershipId, ref, delta: v.quantity, reason: "OPENING_STOCK", note: v.note, userId: user.id });
      }
      await audit({ userId: user.id, dealershipId, action: "inventory.item_added", entityType: "InventoryItem", entityId: existing.id, changes: { item: meta.name, quantity: v.quantity, reorderLevel: v.reorderLevel } }, tx);
    });
    return { ok: true as const, message: "Item added to your showroom inventory." };
  });
}

/** Add, remove or recount stock. Every change is written to the item's movement history. */
export async function adjustStockAction(dealershipId: string, input: z.input<typeof stockAdjustSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = stockAdjustSchema.parse(input);
    const item = await db.inventoryItem.findFirst({ where: { id: v.itemId, dealershipId }, include: { bikeModel: true, product: true } });
    if (!item) throw notFound("Inventory item not found.");
    const ref: ItemRef = item.bikeModelId ? { bikeModelId: item.bikeModelId } : { productId: item.productId! };
    const name = item.bikeModel?.name ?? item.product?.name ?? "Item";
    const result = await db.$transaction(async (tx) => {
      const before = item.quantity;
      const r =
        v.mode === "SET"
          ? await adjustStock(tx, { dealershipId, ref, delta: 0, setTo: v.quantity, reason: "ADJUSTMENT", note: v.note, userId: user.id })
          : await adjustStock(tx, {
              dealershipId, ref, delta: v.mode === "ADD" ? v.quantity : -v.quantity,
              reason: v.reason, note: v.note, userId: user.id,
            });
      await warnIfLow(tx, dealershipId, [item.id]);
      await audit({ userId: user.id, dealershipId, action: "inventory.adjusted", entityType: "InventoryItem", entityId: item.id, changes: { item: name, from: before, to: r.item.quantity, reason: v.reason, note: v.note ?? null } }, tx);
      return r;
    });
    return { ok: true as const, message: `${name}: ${result.item.quantity} in stock.` };
  });
}

export async function setReorderLevelAction(dealershipId: string, input: z.input<typeof reorderLevelSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = reorderLevelSchema.parse(input);
    const item = await db.inventoryItem.findFirst({ where: { id: v.itemId, dealershipId } });
    if (!item) throw notFound("Inventory item not found.");
    await db.inventoryItem.update({ where: { id: item.id }, data: { reorderLevel: v.reorderLevel } });
    await audit({ userId: user.id, dealershipId, action: "inventory.reorder_level_set", entityType: "InventoryItem", entityId: item.id, changes: { reorderLevel: { from: item.reorderLevel, to: v.reorderLevel } } });
    return { ok: true as const, message: "Reorder level saved." };
  });
}

/** Movement history of one item (the user's own dealership only). */
export async function itemMovementsAction(dealershipId: string, itemId: string) {
  return runAction(async () => {
    const user = await requireUser("inventory.view");
    requireOwnDealership(user, dealershipId);
    const rows = await db.inventoryMovement.findMany({
      where: { itemId, dealershipId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id, at: r.createdAt.toISOString(), delta: r.delta, after: r.quantityAfter, reason: r.reason, note: r.note, by: r.createdBy?.name ?? "System", refType: r.refType, refId: r.refId,
    }));
  });
}
