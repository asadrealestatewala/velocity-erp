import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { addStockItemAction, adjustStockAction, setReorderLevelAction } from "@/server/actions/inventory";
import { closeTransferAction, receiveTransferAction, sendTransferAction } from "@/server/actions/stock-transfers";
import { cancelStockCountAction, completeStockCountAction, saveStockCountAction, startStockCountAction } from "@/server/actions/stock-counts";
import { runScheduledJobs } from "@/server/services/jobs";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
let bikeId: string;

function ok<T extends { ok: boolean }>(r: T) {
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
}
const as = async (id: string) => { session.current = await asUser(id); };
const qty = async (dealershipId: string) => (await db.inventoryItem.findFirst({ where: { dealershipId, bikeModelId: bikeId } }))?.quantity ?? 0;
const itemOf = (dealershipId: string) => db.inventoryItem.findFirstOrThrow({ where: { dealershipId, bikeModelId: bikeId } });

beforeEach(async () => {
  w = await buildWorld();
  bikeId = w.m1.id;
  // A is the parent outlet, B its branch; K (Karachi) is an unrelated dealership.
  await db.dealership.update({ where: { id: w.B.id }, data: { parentId: w.A.id } });
  await as(w.aManager.id);
  ok(await addStockItemAction(w.A.id, { itemKey: `B:${bikeId}`, quantity: 10, reorderLevel: 2 }));
});

describe("stock transfers between outlets", () => {
  it("deducts on send and adds on receipt, with a movement history on both sides", async () => {
    const item = await itemOf(w.A.id);
    const t = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 4 }] })).data!.id;
    expect(await qty(w.A.id)).toBe(6);
    expect(await qty(w.B.id)).toBe(0); // not there until received
    await as(w.bManager.id);
    ok(await receiveTransferAction(w.B.id, { transferId: t }));
    expect(await qty(w.B.id)).toBe(4);
    expect((await db.stockTransfer.findUniqueOrThrow({ where: { id: t } })).status).toBe("RECEIVED");
    const out = await db.inventoryMovement.findFirstOrThrow({ where: { itemId: item.id, reason: "TRANSFER_OUT" } });
    expect([out.delta, out.refType, out.refId]).toEqual([-4, "StockTransfer", t]);
    expect(await db.inventoryMovement.count({ where: { dealershipId: w.B.id, reason: "TRANSFER_IN", delta: 4 } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: { in: ["inventory.transfer_sent", "inventory.transfer_received"] } } })).toBe(2);
  });

  it("returns a short delivery's difference to the sender", async () => {
    const item = await itemOf(w.A.id);
    const t = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 5 }] })).data!.id;
    const line = await db.stockTransferLine.findFirstOrThrow({ where: { transferId: t } });
    await as(w.bManager.id);
    ok(await receiveTransferAction(w.B.id, { transferId: t, received: { [line.id]: 3 } }));
    expect(await qty(w.B.id)).toBe(3);
    expect(await qty(w.A.id)).toBe(7);
    expect((await db.stockTransferLine.findUniqueOrThrow({ where: { id: line.id } })).receivedQuantity).toBe(3);
  });

  it("cannot send more than is on hand, to oneself or to an unrelated dealership", async () => {
    const item = await itemOf(w.A.id);
    expect((await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 11 }] })).ok).toBe(false);
    expect((await sendTransferAction(w.A.id, { toDealershipId: w.A.id, lines: [{ itemId: item.id, quantity: 1 }] })).ok).toBe(false);
    expect((await sendTransferAction(w.A.id, { toDealershipId: w.K.id, lines: [{ itemId: item.id, quantity: 1 }] })).ok).toBe(false);
    expect(await qty(w.A.id)).toBe(10);
    expect(await db.stockTransfer.count()).toBe(0);
  });

  it("is all-or-nothing across lines", async () => {
    ok(await addStockItemAction(w.A.id, { itemKey: `B:${w.m2.id}`, quantity: 1 }));
    const a = await itemOf(w.A.id);
    const b = await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id, bikeModelId: w.m2.id } });
    const r = await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: a.id, quantity: 2 }, { itemId: b.id, quantity: 5 }] });
    expect(r.ok).toBe(false);
    expect(await qty(w.A.id)).toBe(10);
    expect(await db.stockTransfer.count()).toBe(0);
  });

  it("only the right outlet can receive, cancel or reject, and only once", async () => {
    const item = await itemOf(w.A.id);
    const t = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 3 }] })).data!.id;
    // the sender cannot receive its own transfer; a stranger cannot do anything
    expect((await receiveTransferAction(w.A.id, { transferId: t })).ok).toBe(false);
    expect((await closeTransferAction(w.A.id, { transferId: t, kind: "REJECT" })).ok).toBe(false);
    await as(w.bManager.id);
    expect((await closeTransferAction(w.B.id, { transferId: t, kind: "CANCEL" })).ok).toBe(false);
    expect((await receiveTransferAction(w.A.id, { transferId: t })).ok).toBe(false); // not their dealership
    // a rep may not manage stock
    await as(w.bRep.id);
    expect((await receiveTransferAction(w.B.id, { transferId: t })).ok).toBe(false);
    await as(w.bManager.id);
    ok(await receiveTransferAction(w.B.id, { transferId: t }));
    expect((await receiveTransferAction(w.B.id, { transferId: t })).ok).toBe(false);
    expect(await qty(w.B.id)).toBe(3);
  });

  it("cancelling or rejecting puts the stock back with the sender", async () => {
    const item = await itemOf(w.A.id);
    const t1 = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 3 }] })).data!.id;
    ok(await closeTransferAction(w.A.id, { transferId: t1, kind: "CANCEL", reason: "Wrong model" }));
    expect(await qty(w.A.id)).toBe(10);
    const t2 = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 4 }] })).data!.id;
    await as(w.bManager.id);
    ok(await closeTransferAction(w.B.id, { transferId: t2, kind: "REJECT" }));
    expect(await qty(w.A.id)).toBe(10);
    expect(await qty(w.B.id)).toBe(0);
    expect((await receiveTransferAction(w.B.id, { transferId: t2 })).ok).toBe(false);
  });

  it("two simultaneous receipts add the stock once", async () => {
    const item = await itemOf(w.A.id);
    const t = ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 6 }] })).data!.id;
    await as(w.bManager.id);
    await Promise.all([receiveTransferAction(w.B.id, { transferId: t }), receiveTransferAction(w.B.id, { transferId: t })]);
    expect(await qty(w.B.id)).toBe(6);
    expect(await qty(w.A.id)).toBe(4);
  });
});

describe("stock counts", () => {
  it("applies counted differences as variances and keeps them in the history", async () => {
    const item = await itemOf(w.A.id);
    const c = ok(await startStockCountAction(w.A.id, { title: "Month end" })).data!.id;
    const line = await db.stockCountLine.findFirstOrThrow({ where: { countId: c } });
    expect(line.expectedQuantity).toBe(10);
    ok(await saveStockCountAction(w.A.id, { countId: c, entries: [{ lineId: line.id, counted: 7 }] }));
    expect(await qty(w.A.id)).toBe(10); // nothing changes until the count is closed
    ok(await completeStockCountAction(w.A.id, c));
    expect(await qty(w.A.id)).toBe(7);
    const m = await db.inventoryMovement.findFirstOrThrow({ where: { itemId: item.id, reason: "COUNT_VARIANCE" } });
    expect([m.delta, m.quantityAfter, m.refType, m.refId]).toEqual([-3, 7, "StockCount", c]);
    expect((await db.stockCount.findUniqueOrThrow({ where: { id: c } })).status).toBe("COMPLETED");
    expect(await db.auditLog.count({ where: { action: "inventory.count_completed", dealershipId: w.A.id } })).toBe(1);
    // closed counts are final
    expect((await completeStockCountAction(w.A.id, c)).ok).toBe(false);
    expect((await saveStockCountAction(w.A.id, { countId: c, entries: [{ lineId: line.id, counted: 1 }] })).ok).toBe(false);
  });

  it("keeps sales made while counting: the variance is relative to the snapshot", async () => {
    const item = await itemOf(w.A.id);
    const c = ok(await startStockCountAction(w.A.id, {})).data!.id;
    ok(await adjustStockAction(w.A.id, { itemId: item.id, mode: "REMOVE", quantity: 2 })); // 10 → 8 during the count
    const line = await db.stockCountLine.findFirstOrThrow({ where: { countId: c } });
    ok(await saveStockCountAction(w.A.id, { countId: c, entries: [{ lineId: line.id, counted: 9 }] })); // shelf had 9 at snapshot time
    ok(await completeStockCountAction(w.A.id, c));
    expect(await qty(w.A.id)).toBe(7); // 8 on record − 1 missing
  });

  it("leaves uncounted lines alone, allows one open count and can be cancelled", async () => {
    const c = ok(await startStockCountAction(w.A.id, {})).data!.id;
    expect((await startStockCountAction(w.A.id, {})).ok).toBe(false);
    ok(await completeStockCountAction(w.A.id, c));
    expect(await qty(w.A.id)).toBe(10);
    const c2 = ok(await startStockCountAction(w.A.id, {})).data!.id;
    ok(await cancelStockCountAction(w.A.id, c2));
    expect((await db.stockCount.findUniqueOrThrow({ where: { id: c2 } })).status).toBe("CANCELLED");
    expect(await db.inventoryMovement.count({ where: { reason: "COUNT_VARIANCE" } })).toBe(0);
  });

  it("is limited to the user's own dealership and to stock managers", async () => {
    const c = ok(await startStockCountAction(w.A.id, {})).data!.id;
    await as(w.bManager.id);
    expect((await completeStockCountAction(w.A.id, c)).ok).toBe(false);
    expect((await startStockCountAction(w.A.id, {})).ok).toBe(false);
    await as(w.aRep.id);
    expect((await startStockCountAction(w.A.id, {})).ok).toBe(false);
    expect((await completeStockCountAction(w.A.id, c)).ok).toBe(false);
    await as(w.admin.id);
    expect((await completeStockCountAction(w.A.id, c)).ok).toBe(false);
    // B's manager cannot reach A's count even through B's own context
    await as(w.bManager.id);
    expect((await completeStockCountAction(w.B.id, c)).ok).toBe(false);
  });
});

describe("low-stock alerts", () => {
  const lowAlerts = () => db.notification.count({ where: { userId: w.aManager.id, type: "STOCK_LOW" } });

  it("alerts when a transfer takes the showroom to its reorder level", async () => {
    const item = await itemOf(w.A.id);
    ok(await sendTransferAction(w.A.id, { toDealershipId: w.B.id, lines: [{ itemId: item.id, quantity: 8 }] }));
    expect(await lowAlerts()).toBe(1);
  });

  it("alerts when the reorder level is raised above the current stock", async () => {
    const item = await itemOf(w.A.id);
    expect(await lowAlerts()).toBe(0);
    ok(await setReorderLevelAction(w.A.id, { itemId: item.id, reorderLevel: 12 }));
    expect(await lowAlerts()).toBe(1);
  });

  it("the daily sweep catches items that slipped below their level and never alerts twice a day", async () => {
    const item = await itemOf(w.A.id);
    await db.inventoryItem.update({ where: { id: item.id }, data: { quantity: 1 } }); // changed outside the tracked paths
    expect(await runScheduledJobs()).toMatchObject({ lowStock: 1 });
    expect(await lowAlerts()).toBe(1);
    await runScheduledJobs();
    expect(await lowAlerts()).toBe(1);
  });
});
