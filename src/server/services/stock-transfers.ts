import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/server/errors";
import { adjustStock, warnIfLow, type ItemRef } from "@/server/services/inventory";
import { dealershipUserIds, notify } from "@/server/services/notifications";

/**
 * Outlets a showroom may transfer stock to: active outlets of the same group (the parent outlet, its branches and
 * their siblings). Unrelated dealerships are separate businesses — moving stock between them is a sale, not a transfer.
 */
export async function relatedOutlets(tx: Tx | typeof db, dealershipId: string) {
  const me = await tx.dealership.findUnique({ where: { id: dealershipId }, select: { id: true, parentId: true } });
  if (!me) return [];
  const root = me.parentId ?? me.id;
  return tx.dealership.findMany({
    where: { status: "ACTIVE", id: { not: dealershipId }, OR: [{ id: root }, { parentId: root }] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}

const refOf = (l: { bikeModelId: string | null; productId: string | null }): ItemRef => (l.bikeModelId ? { bikeModelId: l.bikeModelId } : { productId: l.productId! });

/** Lock the transfer row so two people can't receive / cancel it at the same moment. */
async function lockTransfer(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "StockTransfer" WHERE "id" = ${id} FOR UPDATE`;
}

export type TransferLineInput = { itemId: string; quantity: number };

/** Send stock to another outlet: deducts the source now; the destination adds it when it confirms receipt. */
export async function sendTransfer(tx: Tx, c: { fromDealershipId: string; toDealershipId: string; lines: TransferLineInput[]; note?: string | null; userId: string }) {
  if (c.fromDealershipId === c.toDealershipId) throw new AppError("Choose a different outlet to send stock to.", "VALIDATION", { toDealershipId: "Pick another outlet" });
  if (!(await relatedOutlets(tx, c.fromDealershipId)).some((o) => o.id === c.toDealershipId)) {
    throw new AppError("You can only transfer stock to another active outlet of your own group.", "VALIDATION", { toDealershipId: "Not available" });
  }
  // One line per item.
  const merged = new Map<string, number>();
  for (const l of c.lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
  if (!merged.size) throw new AppError("Add at least one item to transfer.");

  const items = await tx.inventoryItem.findMany({ where: { id: { in: [...merged.keys()] }, dealershipId: c.fromDealershipId } });
  if (items.length !== merged.size) throw notFound("One of the items is not in your inventory.");

  const transfer = await tx.stockTransfer.create({
    data: {
      fromDealershipId: c.fromDealershipId, toDealershipId: c.toDealershipId, note: c.note ?? null, createdById: c.userId,
      lines: { create: items.map((i) => ({ itemId: i.id, bikeModelId: i.bikeModelId, productId: i.productId, quantity: merged.get(i.id)! })) },
    },
    include: { lines: true, from: { select: { name: true } } },
  });
  for (const l of transfer.lines) {
    await adjustStock(tx, { dealershipId: c.fromDealershipId, ref: refOf(l), delta: -l.quantity, reason: "TRANSFER_OUT", refType: "StockTransfer", refId: transfer.id, note: `Transfer TR-${transfer.number}`, userId: c.userId });
  }
  await warnIfLow(tx, c.fromDealershipId, items.map((i) => i.id));
  await notify(tx, {
    userIds: await dealershipUserIds(tx, c.toDealershipId, true), type: "STOCK_TRANSFER",
    title: `Stock on its way from ${transfer.from.name} (TR-${transfer.number})`,
    body: `${transfer.lines.reduce((n, l) => n + l.quantity, 0)} unit(s). Confirm receipt when it arrives so your stock updates.`,
    link: { portal: `/portal/stock-transfers/${transfer.id}` }, entityType: "StockTransfer", entityId: transfer.id, dedupeKey: `transfer-sent:${transfer.id}`,
  });
  return transfer;
}

/** The destination confirms what arrived. Anything short goes back to the sender. */
export async function receiveTransfer(tx: Tx, c: { transferId: string; toDealershipId: string; received?: Record<string, number>; userId: string }) {
  await lockTransfer(tx, c.transferId);
  const t = await tx.stockTransfer.findFirst({ where: { id: c.transferId, toDealershipId: c.toDealershipId }, include: { lines: true, to: { select: { name: true } } } });
  if (!t) throw notFound("Transfer not found.");
  if (t.status !== "IN_TRANSIT") throw new AppError("This transfer has already been closed.", "CONFLICT");
  const touched: string[] = [];
  for (const l of t.lines) {
    const got = c.received?.[l.id] ?? l.quantity;
    if (!Number.isInteger(got) || got < 0 || got > l.quantity) throw new AppError("Received quantity cannot exceed what was sent.", "VALIDATION");
    await tx.stockTransferLine.update({ where: { id: l.id }, data: { receivedQuantity: got } });
    if (got > 0) {
      const r = await adjustStock(tx, { dealershipId: t.toDealershipId, ref: refOf(l), delta: got, reason: "TRANSFER_IN", refType: "StockTransfer", refId: t.id, note: `Transfer TR-${t.number}`, userId: c.userId });
      touched.push(r.item.id);
    }
    if (got < l.quantity) {
      await adjustStock(tx, { dealershipId: t.fromDealershipId, ref: refOf(l), delta: l.quantity - got, reason: "TRANSFER_IN", refType: "StockTransfer", refId: t.id, note: `Short receipt on TR-${t.number}`, userId: c.userId });
    }
  }
  const done = await tx.stockTransfer.updateMany({ where: { id: t.id, status: "IN_TRANSIT" }, data: { status: "RECEIVED", receivedById: c.userId, resolvedAt: new Date() } });
  if (done.count !== 1) throw new AppError("This transfer has already been closed.", "CONFLICT");
  const short = t.lines.reduce((n, l) => n + (l.quantity - (c.received?.[l.id] ?? l.quantity)), 0);
  await notify(tx, {
    userIds: await dealershipUserIds(tx, t.fromDealershipId, true), type: "STOCK_TRANSFER",
    title: `${t.to.name} received transfer TR-${t.number}`, body: short ? `${short} unit(s) were short and have been returned to your stock.` : "Everything arrived.",
    link: { portal: `/portal/stock-transfers/${t.id}` }, entityType: "StockTransfer", entityId: t.id, dedupeKey: `transfer-received:${t.id}`,
  });
  return { transfer: t, short };
}

/** The sender withdraws a transfer (CANCEL) or the destination refuses it (REJECT); the stock goes back to the sender. */
export async function closeTransfer(tx: Tx, c: { transferId: string; dealershipId: string; kind: "CANCEL" | "REJECT"; reason?: string | null; userId: string }) {
  await lockTransfer(tx, c.transferId);
  const t = await tx.stockTransfer.findFirst({
    where: { id: c.transferId, ...(c.kind === "CANCEL" ? { fromDealershipId: c.dealershipId } : { toDealershipId: c.dealershipId }) },
    include: { lines: true, from: { select: { name: true } }, to: { select: { name: true } } },
  });
  if (!t) throw notFound("Transfer not found.");
  if (t.status !== "IN_TRANSIT") throw new AppError("This transfer has already been closed.", "CONFLICT");
  const done = await tx.stockTransfer.updateMany({
    where: { id: t.id, status: "IN_TRANSIT" },
    data: { status: c.kind === "CANCEL" ? "CANCELLED" : "REJECTED", resolutionNote: c.reason ?? null, resolvedAt: new Date() },
  });
  if (done.count !== 1) throw new AppError("This transfer has already been closed.", "CONFLICT");
  for (const l of t.lines) {
    await adjustStock(tx, { dealershipId: t.fromDealershipId, ref: refOf(l), delta: l.quantity, reason: "TRANSFER_IN", refType: "StockTransfer", refId: t.id, note: `${c.kind === "CANCEL" ? "Cancelled" : "Rejected"} TR-${t.number}`, userId: c.userId });
  }
  const other = c.kind === "CANCEL" ? t.toDealershipId : t.fromDealershipId;
  await notify(tx, {
    userIds: await dealershipUserIds(tx, other, true), type: "STOCK_TRANSFER",
    title: `Transfer TR-${t.number} was ${c.kind === "CANCEL" ? "cancelled by " + t.from.name : "rejected by " + t.to.name}`,
    body: c.reason ?? undefined, link: { portal: `/portal/stock-transfers/${t.id}` }, entityType: "StockTransfer", entityId: t.id, dedupeKey: `transfer-closed:${t.id}`,
  });
  return t;
}

export const transferInclude = {
  from: { select: { id: true, name: true } },
  to: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  lines: { include: { item: { include: { bikeModel: { select: { name: true, code: true } }, product: { select: { name: true, sku: true, unit: true } } } } } },
} satisfies Prisma.StockTransferInclude;

/** Transfers a showroom sent or is due to receive. */
export async function listTransfers(dealershipId: string, take = 100) {
  return db.stockTransfer.findMany({
    where: { OR: [{ fromDealershipId: dealershipId }, { toDealershipId: dealershipId }] },
    orderBy: { sentAt: "desc" }, take, include: transferInclude,
  });
}
