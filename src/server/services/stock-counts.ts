import "server-only";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/server/errors";
import { adjustStock, warnIfLow, type ItemRef } from "@/server/services/inventory";

async function lockCount(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${id} FOR UPDATE`;
}

/** Start a stock take: snapshots what the system expects for every item so counters can't be influenced by it later. */
export async function startCount(tx: Tx, c: { dealershipId: string; title?: string | null; note?: string | null; userId: string }) {
  if (await tx.stockCount.findFirst({ where: { dealershipId: c.dealershipId, status: "IN_PROGRESS" }, select: { id: true } })) {
    throw new AppError("A stock count is already in progress — finish or cancel it first.", "CONFLICT");
  }
  const items = await tx.inventoryItem.findMany({ where: { dealershipId: c.dealershipId }, select: { id: true, quantity: true } });
  if (!items.length) throw new AppError("There is no stock to count yet. Add items to your inventory first.");
  return tx.stockCount.create({
    data: {
      dealershipId: c.dealershipId, title: c.title ?? null, note: c.note ?? null, startedById: c.userId,
      lines: { create: items.map((i) => ({ itemId: i.id, expectedQuantity: i.quantity })) },
    },
  });
}

async function openCount(tx: Tx, countId: string, dealershipId: string) {
  await lockCount(tx, countId);
  const count = await tx.stockCount.findFirst({ where: { id: countId, dealershipId }, include: { lines: { include: { item: { include: { bikeModel: { select: { name: true } }, product: { select: { name: true } } } } } } } });
  if (!count) throw notFound("Stock count not found.");
  if (count.status !== "IN_PROGRESS") throw new AppError("This stock count is already closed.", "CONFLICT");
  return count;
}

/** Record counted quantities (null clears a line back to "not counted"). */
export async function saveCounts(tx: Tx, c: { countId: string; dealershipId: string; entries: { lineId: string; counted: number | null; note?: string | null }[] }) {
  const count = await openCount(tx, c.countId, c.dealershipId);
  const ids = new Set(count.lines.map((l) => l.id));
  for (const e of c.entries) {
    if (!ids.has(e.lineId)) throw notFound("Count line not found.");
    await tx.stockCountLine.update({ where: { id: e.lineId }, data: { countedQuantity: e.counted, ...(e.note !== undefined ? { note: e.note } : {}) } });
  }
  return count;
}

/**
 * Finish the stock take. Each counted line whose result differs from the snapshot is applied as a variance
 * (counted − expected), so sales or receipts made while counting are preserved. Uncounted lines are left untouched.
 */
export async function completeCount(tx: Tx, c: { countId: string; dealershipId: string; userId: string }) {
  const count = await openCount(tx, c.countId, c.dealershipId);
  const variances: { item: string; expected: number; counted: number; delta: number }[] = [];
  const touched: string[] = [];
  for (const l of count.lines) {
    if (l.countedQuantity === null) continue;
    const delta = l.countedQuantity - l.expectedQuantity;
    if (delta === 0) continue;
    const ref: ItemRef = l.item.bikeModelId ? { bikeModelId: l.item.bikeModelId } : { productId: l.item.productId! };
    const r = await adjustStock(tx, { dealershipId: c.dealershipId, ref, delta, reason: "COUNT_VARIANCE", refType: "StockCount", refId: count.id, note: `Stock count SC-${count.number}`, userId: c.userId });
    touched.push(r.item.id);
    variances.push({ item: l.item.bikeModel?.name ?? l.item.product?.name ?? "Item", expected: l.expectedQuantity, counted: l.countedQuantity, delta });
  }
  const done = await tx.stockCount.updateMany({ where: { id: count.id, status: "IN_PROGRESS" }, data: { status: "COMPLETED", completedAt: new Date() } });
  if (done.count !== 1) throw new AppError("This stock count is already closed.", "CONFLICT");
  await warnIfLow(tx, c.dealershipId, touched);
  return { count, variances, counted: count.lines.filter((l) => l.countedQuantity !== null).length, total: count.lines.length };
}

export async function cancelCount(tx: Tx, c: { countId: string; dealershipId: string }) {
  const count = await openCount(tx, c.countId, c.dealershipId);
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "CANCELLED", completedAt: new Date() } });
  return count;
}

export async function listCounts(dealershipId: string) {
  return db.stockCount.findMany({
    where: { dealershipId }, orderBy: { createdAt: "desc" }, take: 50,
    include: { startedBy: { select: { name: true } }, _count: { select: { lines: true } } },
  });
}
