import "server-only";
import type { InventoryReason } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { isoDay } from "@/lib/utils";
import { stockState } from "@/lib/ops-constants";
import { AppError } from "@/server/errors";
import { dealershipUserIds, notify } from "@/server/services/notifications";

export type ItemRef = { bikeModelId: string; productId?: undefined } | { productId: string; bikeModelId?: undefined };

/** Resolve a stockable item (bike model or spare part) to its display data, rejecting inactive/unknown ids. */
export async function resolveItem(tx: Tx, ref: ItemRef) {
  if (ref.bikeModelId) {
    const m = await tx.bikeModel.findUnique({ where: { id: ref.bikeModelId } });
    if (!m || !m.isActive) throw new AppError("That bike model is not available.", "NOT_FOUND");
    return { kind: "BIKE" as const, id: m.id, name: m.name, code: m.code, price: m.price, dealerPrice: m.dealerPrice, currency: m.currency };
  }
  const p = await tx.product.findUnique({ where: { id: ref.productId! } });
  if (!p || !p.isActive) throw new AppError("That spare part is not available.", "NOT_FOUND");
  return { kind: "PART" as const, id: p.id, name: p.name, code: p.sku, price: p.price, dealerPrice: p.dealerPrice, currency: p.currency };
}

/** Find the showroom's stock row for an item, creating it (at zero) the first time the item is stocked. */
export async function ensureItem(tx: Tx, dealershipId: string, ref: ItemRef) {
  const where = ref.bikeModelId ? { dealershipId_bikeModelId: { dealershipId, bikeModelId: ref.bikeModelId } } : { dealershipId_productId: { dealershipId, productId: ref.productId! } };
  const existing = await tx.inventoryItem.findUnique({ where });
  if (existing) return existing;
  try {
    return await tx.inventoryItem.create({ data: { dealershipId, bikeModelId: ref.bikeModelId ?? null, productId: ref.productId ?? null } });
  } catch {
    // A concurrent request created it first — read theirs.
    return tx.inventoryItem.findUniqueOrThrow({ where });
  }
}

/** Lock a stock row for the rest of the transaction so read-modify-write adjustments can't interleave. */
async function lockItem(tx: Tx, itemId: string) {
  await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`;
}

export type StockChange = {
  dealershipId: string;
  ref: ItemRef;
  /** Positive adds stock, negative removes it. */
  delta: number;
  reason: InventoryReason;
  refType?: string;
  refId?: string;
  note?: string | null;
  userId?: string | null;
  /** Stocktake: set the absolute count instead of applying `delta` (delta is computed under a row lock). */
  setTo?: number;
};

/**
 * The only way stock changes. Atomically updates the quantity and appends exactly one movement, and refuses to
 * go below zero (the conditional UPDATE is race-safe; a CHECK constraint backs it up at the database level).
 */
export async function adjustStock(tx: Tx, c: StockChange) {
  const item = await ensureItem(tx, c.dealershipId, c.ref);
  await lockItem(tx, item.id);
  const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  const delta = c.setTo !== undefined ? c.setTo - current.quantity : c.delta;
  if (delta === 0 && c.setTo === undefined) throw new AppError("The quantity change is zero.");
  if (current.quantity + delta < 0) {
    const meta = await resolveItem(tx, c.ref).catch(() => null);
    throw new AppError(`Not enough stock${meta ? ` of ${meta.name}` : ""}: ${current.quantity} available, ${-delta} needed.`, "CONFLICT");
  }
  const updated = await tx.inventoryItem.updateMany({
    where: { id: item.id, quantity: { gte: delta < 0 ? -delta : 0 } },
    data: { quantity: { increment: delta } },
  });
  if (updated.count !== 1) throw new AppError("Stock changed while saving. Please try again.", "CONFLICT");
  const after = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  if (delta !== 0) {
    await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        dealershipId: c.dealershipId,
        delta,
        quantityAfter: after.quantity,
        reason: c.reason,
        refType: c.refType ?? null,
        refId: c.refId ?? null,
        note: c.note ?? null,
        createdById: c.userId ?? null,
      },
    });
  }
  return { item: after, delta };
}

/** Warn the dealership's managers when an item drops to (or below) its reorder level. Once per item per day. */
export async function warnIfLow(tx: Tx, dealershipId: string, itemIds: string[]) {
  if (!itemIds.length) return;
  const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } }, include: { bikeModel: true, product: true } });
  const low = items.filter((i) => stockState(i.quantity, i.reorderLevel) !== "OK" && (i.reorderLevel > 0 || i.quantity <= 0));
  if (!low.length) return;
  const managers = await dealershipUserIds(tx, dealershipId, true);
  const day = isoDay(new Date());
  for (const i of low) {
    const name = i.bikeModel?.name ?? i.product?.name ?? "Item";
    await notify(tx, {
      userIds: managers,
      type: "STOCK_LOW",
      title: i.quantity <= 0 ? `${name} is out of stock` : `${name} is running low (${i.quantity} left)`,
      body: "Place a stock order with YADEA procurement to replenish it.",
      link: { portal: "/portal/stock-orders/new?low=1", central: "/procurement/stock" },
      entityType: "InventoryItem",
      entityId: i.id,
      dedupeKey: `lowstock:${i.id}:${day}`,
    });
  }
}

/** A showroom's stock with display data, bikes first. */
export async function listShowroomStock(dealershipId: string) {
  const rows = await db.inventoryItem.findMany({
    where: { dealershipId },
    include: { bikeModel: { select: { id: true, name: true, code: true, category: true, price: true, currency: true, imageFileId: true } }, product: { select: { id: true, sku: true, name: true, category: true, price: true, currency: true, unit: true } } },
  });
  return rows
    .map((r) => ({
      id: r.id,
      kind: (r.bikeModelId ? "BIKE" : "PART") as "BIKE" | "PART",
      key: r.bikeModelId ? (`B:${r.bikeModelId}` as const) : (`P:${r.productId}` as const),
      name: r.bikeModel?.name ?? r.product?.name ?? "",
      code: r.bikeModel?.code ?? r.product?.sku ?? "",
      category: r.bikeModel?.category ?? r.product?.category ?? null,
      price: r.bikeModel?.price ?? r.product?.price ?? null,
      currency: r.bikeModel?.currency ?? r.product?.currency ?? "PKR",
      unit: r.product?.unit ?? "pcs",
      imageFileId: r.bikeModel?.imageFileId ?? null,
      quantity: r.quantity,
      reorderLevel: r.reorderLevel,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "BIKE" ? -1 : 1));
}

/** Everything that could be stocked or ordered: active bike models and active spare parts. */
export async function stockableCatalog() {
  const [models, parts] = await Promise.all([
    db.bikeModel.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    db.product.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
  ]);
  return [
    ...models.map((m) => ({ key: `B:${m.id}` as const, kind: "BIKE" as const, name: m.name, code: m.code, category: m.category, price: m.price ? Number(m.price) : null, dealerPrice: m.dealerPrice ? Number(m.dealerPrice) : null, currency: m.currency, unit: "pcs" })),
    ...parts.map((p) => ({ key: `P:${p.id}` as const, kind: "PART" as const, name: p.name, code: p.sku, category: p.category, price: p.price ? Number(p.price) : null, dealerPrice: p.dealerPrice ? Number(p.dealerPrice) : null, currency: p.currency, unit: p.unit })),
  ];
}
export type CatalogItem = Awaited<ReturnType<typeof stockableCatalog>>[number];
