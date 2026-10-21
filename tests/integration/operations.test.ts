import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { loginAction } from "@/server/actions/auth";
import { addStockItemAction, adjustStockAction } from "@/server/actions/inventory";
import { cancelSalesOrderAction, confirmSalesOrderAction, createSalesOrderAction } from "@/server/actions/sales-orders";
import { approveOrderAction, cancelStockOrderAction, confirmReceiptAction, rejectOrderAction, submitStockOrderAction, updateDispatchAction } from "@/server/actions/procurement";
import { recordPaymentAction, rejectPaymentAction, verifyPaymentAction, postLedgerEntryAction } from "@/server/actions/ledger";
import { createVoucherAction, reviewVoucherAction } from "@/server/actions/vouchers";
import { uploadDealerDocumentAction } from "@/server/actions/dealer-docs";
import { dealerBalance, ledgerStatement } from "@/server/services/ledger";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { syncPermissionCatalog } from "@/server/permission-sync";
import { runScheduledJobs } from "@/server/services/jobs";
import { GET as exportLedger } from "@/app/api/ledger/export/route";
import { GET as getFile } from "@/app/api/files/[id]/route";
import { DEFAULT_GRANT_UPGRADES, DEFAULT_ROLES, DEALER_ONLY_PERMISSIONS } from "@/lib/permissions";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
let proc: { id: string };
let bike: { id: string };
let part: { id: string };

const pdf = (name = "proof.pdf") => new File([Buffer.from("%PDF-1.4\n% test document\n")], name, { type: "application/pdf" });
function ok<T extends { ok: boolean }>(r: T) {
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
}
const as = async (id: string) => { session.current = await asUser(id); };
const qty = async (dealershipId: string, key: { bikeModelId?: string; productId?: string }) =>
  (await db.inventoryItem.findFirst({ where: { dealershipId, ...key } }))?.quantity ?? 0;

async function stock(dealershipId: string, itemKey: string, quantity: number, reorderLevel = 0) {
  const u = session.current;
  await as(dealershipId === w.A.id ? w.aManager.id : w.bManager.id);
  ok(await addStockItemAction(dealershipId, { itemKey, quantity, reorderLevel }));
  session.current = u;
}

beforeEach(async () => {
  w = await buildWorld();
  proc = await db.user.create({ data: { email: "proc@test.local", name: "Procurement", passwordHash: "x", roleId: w.roles.PROCUREMENT! } });
  bike = await db.bikeModel.update({ where: { id: w.m1.id }, data: { price: 250000, dealerPrice: 200000 } });
  part = await db.product.create({ data: { sku: "BRK-01", name: "Brake pad set", category: "Brakes", price: 1500, dealerPrice: 1000 } });
  session.current = null;
});

describe("sign-in with email or mobile number", () => {
  const form = (identifier: string, password: string, portal = "portal") => {
    const fd = new FormData();
    fd.set("identifier", identifier); fd.set("password", password); fd.set("portal", portal);
    return fd;
  };
  beforeEach(async () => {
    const bcrypt = await import("bcryptjs");
    await db.user.update({ where: { id: w.aManager.id }, data: { phone: "0300 1112233", phoneNormalized: "923001112233", passwordHash: bcrypt.hashSync("Correct-Horse-1", 4) } });
  });

  it("accepts a mobile number written in any common format", async () => {
    for (const id of ["0300 1112233", "+92 300 1112233", "03001112233"]) {
      await expect(loginAction(undefined, form(id, "Correct-Horse-1"))).rejects.toMatchObject({ digest: expect.stringContaining("/portal/dashboard") });
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: w.aManager.id } })).lastLoginAt).not.toBeNull();
  });

  it("still accepts the email address", async () => {
    await expect(loginAction(undefined, form("A.Manager@test.local", "Correct-Horse-1"))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });

  it("gives the same answer for a wrong password and an unknown number (no account enumeration)", async () => {
    const wrong = await loginAction(undefined, form("0300 1112233", "nope-nope-nope"));
    const unknown = await loginAction(undefined, form("0399 0000000", "nope-nope-nope"));
    expect(wrong).toEqual(unknown);
    expect(wrong?.error).toMatch(/invalid/i);
  });

  it("never writes a full phone number to the audit trail", async () => {
    await loginAction(undefined, form("0300 1112233", "wrong-password"));
    const rows = await db.auditLog.findMany({ where: { action: "auth.login_failed" } });
    expect(JSON.stringify(rows)).not.toContain("1112233");
    expect(JSON.stringify(rows)).toContain("2233");
  });

  it("rejects a mobile number already used by another account", async () => {
    await expect(db.user.update({ where: { id: w.aRep.id }, data: { phone: "0300 1112233", phoneNormalized: "923001112233" } })).rejects.toThrow();
  });
});

describe("showroom inventory", () => {
  it("adds opening stock, adjusts it and keeps an append-only history", async () => {
    await as(w.aManager.id);
    ok(await addStockItemAction(w.A.id, { itemKey: `B:${bike.id}`, quantity: 5, reorderLevel: 2 }));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(5);
    const item = await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id } });
    ok(await adjustStockAction(w.A.id, { itemId: item.id, mode: "ADD", quantity: 3, reason: "RETURN" }));
    ok(await adjustStockAction(w.A.id, { itemId: item.id, mode: "REMOVE", quantity: 1, reason: "DAMAGE" }));
    ok(await adjustStockAction(w.A.id, { itemId: item.id, mode: "SET", quantity: 4, reason: "ADJUSTMENT" }));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(4);
    const moves = await db.inventoryMovement.findMany({ where: { itemId: item.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(moves.map((m) => [m.delta, m.quantityAfter, m.reason])).toEqual([[5, 5, "OPENING_STOCK"], [3, 8, "RETURN"], [-1, 7, "DAMAGE"], [-3, 4, "ADJUSTMENT"]]);
  });

  it("never lets stock go below zero", async () => {
    await as(w.aManager.id);
    ok(await addStockItemAction(w.A.id, { itemKey: `P:${part.id}`, quantity: 2 }));
    const item = await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id } });
    const r = await adjustStockAction(w.A.id, { itemId: item.id, mode: "REMOVE", quantity: 3 });
    expect(r.ok).toBe(false);
    expect(await qty(w.A.id, { productId: part.id })).toBe(2);
  });

  it("is limited to the user's own dealership and to people allowed to manage stock", async () => {
    await as(w.aManager.id);
    ok(await addStockItemAction(w.A.id, { itemKey: `B:${bike.id}`, quantity: 5 }));
    const item = await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id } });
    // another dealership's manager
    await as(w.bManager.id);
    expect((await adjustStockAction(w.A.id, { itemId: item.id, mode: "ADD", quantity: 1 })).ok).toBe(false);
    expect((await addStockItemAction(w.A.id, { itemKey: `P:${part.id}`, quantity: 1 })).ok).toBe(false);
    // a sales rep can view but not manage stock
    await as(w.aRep.id);
    expect((await adjustStockAction(w.A.id, { itemId: item.id, mode: "ADD", quantity: 1 })).ok).toBe(false);
    // central staff are not dealership members
    await as(w.admin.id);
    expect((await adjustStockAction(w.A.id, { itemId: item.id, mode: "ADD", quantity: 1 })).ok).toBe(false);
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(5);
  });

  it("tags its audit entries with the dealership", async () => {
    await as(w.aManager.id);
    ok(await addStockItemAction(w.A.id, { itemKey: `B:${bike.id}`, quantity: 1 }));
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "inventory.item_added" } });
    expect(log.dealershipId).toBe(w.A.id);
  });
});

describe("customer sales orders", () => {
  const line = (itemKey: string, quantity: number, unitPrice = 100) => ({ itemKey, quantity, unitPrice });

  it("confirming deducts stock; cancelling puts it back", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await as(w.aRep.id);
    const created = ok(await createSalesOrderAction(w.A.id, { customerName: "Walk-in Ali", lines: [line(`B:${bike.id}`, 2, 250000)], confirmNow: true }));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(3);
    const order = await db.salesOrder.findFirstOrThrow({ include: { lines: true } });
    expect(order).toMatchObject({ status: "CONFIRMED" });
    expect(Number(order.total)).toBe(500000);
    expect(created.data?.number).toBe(order.number);

    await as(w.aManager.id);
    ok(await cancelSalesOrderAction(order.id, "Customer changed mind"));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(5);
    const moves = await db.inventoryMovement.findMany({ where: { refType: "SalesOrder", refId: order.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(moves.map((m) => [m.reason, m.delta])).toEqual([["SALE", -2], ["SALE_CANCELLED", 2]]);
  });

  it("a draft does not touch stock", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "Walk-in", lines: [line(`B:${bike.id}`, 2)] }));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(5);
    const o = await db.salesOrder.findFirstOrThrow();
    ok(await confirmSalesOrderAction(o.id));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(3);
  });

  it("is all-or-nothing: if one line lacks stock nothing is deducted and the order stays a draft", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await stock(w.A.id, `P:${part.id}`, 1);
    await as(w.aRep.id);
    const r = await createSalesOrderAction(w.A.id, { customerName: "Greedy", lines: [line(`B:${bike.id}`, 2), line(`P:${part.id}`, 3)], confirmNow: true });
    expect(r.ok).toBe(false);
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(5);
    expect(await qty(w.A.id, { productId: part.id })).toBe(1);
    expect(await db.salesOrder.count()).toBe(0);
  });

  it("two simultaneous confirmations of the last unit cannot oversell", async () => {
    await stock(w.A.id, `B:${bike.id}`, 1);
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "One", lines: [line(`B:${bike.id}`, 1)] }));
    ok(await createSalesOrderAction(w.A.id, { customerName: "Two", lines: [line(`B:${bike.id}`, 1)] }));
    const [o1, o2] = await db.salesOrder.findMany({ orderBy: { number: "asc" } });
    const results = await Promise.all([confirmSalesOrderAction(o1!.id), confirmSalesOrderAction(o2!.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(0);
    expect(await db.salesOrder.count({ where: { status: "CONFIRMED" } })).toBe(1);
  });

  it("an order can be confirmed only once", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "Once", lines: [line(`B:${bike.id}`, 1)], confirmNow: true }));
    const o = await db.salesOrder.findFirstOrThrow();
    expect((await confirmSalesOrderAction(o.id)).ok).toBe(false);
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(4);
  });

  it("another dealership cannot confirm or cancel the order", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "Mine", lines: [line(`B:${bike.id}`, 1)] }));
    const o = await db.salesOrder.findFirstOrThrow();
    await as(w.bManager.id);
    expect((await confirmSalesOrderAction(o.id)).ok).toBe(false);
    expect((await cancelSalesOrderAction(o.id)).ok).toBe(false);
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("DRAFT");
  });

  it("logs ORDER_CONFIRMED on the linked contact's timeline", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    const { c, lead } = await db.$transaction(async (tx) => {
      const c = await tx.contact.create({ data: { firstName: "Sara", phone: "03211234567" } });
      const lead = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "MANUAL" });
      await assignLead(tx, { leadId: lead.id, dealershipId: w.A.id, userId: w.aRep.id, type: "MANUAL", assignedById: w.staff.id });
      return { c, lead };
    });
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { contactId: c.id, leadId: lead.id, lines: [line(`B:${bike.id}`, 1)], confirmNow: true }));
    const act = await db.activity.findFirstOrThrow({ where: { contactId: c.id, type: "ORDER_CONFIRMED" } });
    expect(act.dealershipId).toBe(w.A.id);
  });
});

describe("stock orders to procurement", () => {
  async function placeOrder(items: { key: string; qty: number }[] = [{ key: `B:${bike.id}`, qty: 3 }, { key: `P:${part.id}`, qty: 10 }]) {
    await as(w.aManager.id);
    const r = ok(await submitStockOrderAction(w.A.id, { priority: "NORMAL", lines: items.map((i) => ({ itemKey: i.key, quantity: i.qty })) }));
    return r.data!.id;
  }

  it("flows submit → approve → dispatch → deliver → receipt, and receipt adds stock", async () => {
    const id = await placeOrder();
    let o = await db.procurementOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(o).toMatchObject({ status: "SUBMITTED", dispatchStatus: "NOT_DISPATCHED" });
    expect(Number(o.subtotal)).toBe(3 * 200000 + 10 * 1000); // priced from the catalogue dealer price
    expect(await db.notification.count({ where: { userId: proc.id, type: "PROCUREMENT_NEW" } })).toBe(1);

    await as(proc.id);
    const tomorrow = new Date(Date.now() + 2 * 86400_000);
    ok(await approveOrderAction({ orderId: id, prices: {}, expectedDeliveryDate: tomorrow }));
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "PACKING" }));
    expect(await db.ledgerEntry.count()).toBe(0); // no invoice until it ships
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "DISPATCHED", courier: "TCS", trackingNumber: "TRK1" }));
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "IN_TRANSIT" }));
    expect(await db.ledgerEntry.count({ where: { type: "INVOICE", orderId: id } })).toBe(1);
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "DELIVERED" }));

    o = await db.procurementOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(o).toMatchObject({ status: "DELIVERED", dispatchStatus: "DELIVERED", courier: "TCS", trackingNumber: "TRK1" });
    expect(o.deliveredAt).not.toBeNull();
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(0); // delivery alone does not add stock

    await as(w.aManager.id);
    ok(await confirmReceiptAction({ orderId: id, received: {} }));
    expect(await qty(w.A.id, { bikeModelId: bike.id })).toBe(3);
    expect(await qty(w.A.id, { productId: part.id })).toBe(10);
    expect((await confirmReceiptAction({ orderId: id, received: {} })).ok).toBe(false); // cannot be received twice
    expect(await qty(w.A.id, { productId: part.id })).toBe(10);
    expect((await dealerBalance(w.A.id)).balance).toBe(610000);
    const history = await db.procurementStatusHistory.findMany({ where: { orderId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(history.map((h) => h.toStatus)).toEqual(["SUBMITTED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "DELIVERED"]);
  });

  it("a short delivery adds only what arrived", async () => {
    const id = await placeOrder();
    await as(proc.id);
    ok(await approveOrderAction({ orderId: id, prices: {} }));
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "DELIVERED" }));
    const lines = await db.procurementOrderLine.findMany({ where: { orderId: id } });
    const partLine = lines.find((l) => l.productId)!;
    await as(w.aManager.id);
    expect((await confirmReceiptAction({ orderId: id, received: { [partLine.id]: 11 } })).ok).toBe(false); // more than ordered
    ok(await confirmReceiptAction({ orderId: id, received: { [partLine.id]: 7 } }));
    expect(await qty(w.A.id, { productId: part.id })).toBe(7);
    expect((await db.procurementOrderLine.findUniqueOrThrow({ where: { id: partLine.id } })).quantityReceived).toBe(7);
    expect(await db.notification.count({ where: { userId: proc.id, type: "PROCUREMENT_UPDATE" } })).toBeGreaterThan(0);
  });

  it("approval can set prices and the invoice follows the approved prices", async () => {
    const id = await placeOrder([{ key: `P:${part.id}`, qty: 4 }]);
    const line = await db.procurementOrderLine.findFirstOrThrow({ where: { orderId: id } });
    await as(proc.id);
    ok(await approveOrderAction({ orderId: id, prices: { [line.id]: 900 } }));
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "DISPATCHED" }));
    const inv = await db.ledgerEntry.findFirstOrThrow({ where: { orderId: id } });
    expect(Number(inv.debit)).toBe(3600);
  });

  it("dispatch can only move forward and only after approval; the invoice is raised once", async () => {
    const id = await placeOrder();
    await as(proc.id);
    expect((await updateDispatchAction({ orderId: id, dispatchStatus: "DISPATCHED" })).ok).toBe(false); // not approved yet
    ok(await approveOrderAction({ orderId: id, prices: {} }));
    expect((await approveOrderAction({ orderId: id, prices: {} })).ok).toBe(false); // already approved
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "IN_TRANSIT" }));
    expect((await updateDispatchAction({ orderId: id, dispatchStatus: "PACKING" })).ok).toBe(false); // backwards
    expect((await updateDispatchAction({ orderId: id, dispatchStatus: "IN_TRANSIT" })).ok).toBe(false); // same step
    expect(await db.ledgerEntry.count({ where: { type: "INVOICE", orderId: id } })).toBe(1);
    ok(await updateDispatchAction({ orderId: id, dispatchStatus: "DELIVERED" }));
    expect(await db.ledgerEntry.count({ where: { type: "INVOICE", orderId: id } })).toBe(1);
  });

  it("the dealership can cancel only while the order is untouched; procurement can reject with a reason", async () => {
    const a = await placeOrder();
    await as(w.aManager.id);
    ok(await cancelStockOrderAction(a));
    const b = await placeOrder();
    await as(proc.id);
    expect((await rejectOrderAction(b, "x")).ok).toBe(false); // reason needed
    ok(await rejectOrderAction(b, "Item discontinued"));
    expect((await db.procurementOrder.findUniqueOrThrow({ where: { id: b } })).status).toBe("REJECTED");
    const c = await placeOrder();
    await as(proc.id);
    ok(await approveOrderAction({ orderId: c, prices: {} }));
    await as(w.aManager.id);
    expect((await cancelStockOrderAction(c)).ok).toBe(false); // already approved
  });

  it("dealers cannot act on each other's orders or on procurement's side", async () => {
    const id = await placeOrder();
    await as(w.bManager.id);
    expect((await cancelStockOrderAction(id)).ok).toBe(false);
    expect((await approveOrderAction({ orderId: id, prices: {} })).ok).toBe(false);
    expect((await updateDispatchAction({ orderId: id, dispatchStatus: "DELIVERED" })).ok).toBe(false);
    await as(w.aRep.id); // reps can't place stock orders
    expect((await submitStockOrderAction(w.A.id, { priority: "NORMAL", lines: [{ itemKey: `B:${bike.id}`, quantity: 1 }] })).ok).toBe(false);
    await as(w.staff.id); // CRM staff have no procurement permissions
    expect((await approveOrderAction({ orderId: id, prices: {} })).ok).toBe(false);
    expect((await db.procurementOrder.findUniqueOrThrow({ where: { id } })).status).toBe("SUBMITTED");
  });
});

describe("scheduled jobs for stock orders", () => {
  it("alerts about late deliveries and unconfirmed receipts exactly once", async () => {
    await as(w.aManager.id);
    const a = ok(await submitStockOrderAction(w.A.id, { priority: "NORMAL", lines: [{ itemKey: `B:${bike.id}`, quantity: 1 }] })).data!.id;
    const b = ok(await submitStockOrderAction(w.A.id, { priority: "NORMAL", lines: [{ itemKey: `P:${part.id}`, quantity: 2 }] })).data!.id;
    await as(proc.id);
    ok(await approveOrderAction({ orderId: a, prices: {} }));
    ok(await approveOrderAction({ orderId: b, prices: {} }));
    ok(await updateDispatchAction({ orderId: b, dispatchStatus: "DELIVERED" }));
    const longAgo = new Date(Date.now() - 5 * 86400_000);
    await db.procurementOrder.update({ where: { id: a }, data: { expectedDeliveryDate: new Date(Date.now() - 3 * 86400_000) } });
    await db.procurementOrder.update({ where: { id: b }, data: { deliveredAt: longAgo } });
    const first = await runScheduledJobs();
    expect(first).toMatchObject({ lateDeliveries: 1, receiptReminders: 1 });
    const again = await runScheduledJobs();
    expect(again).toMatchObject({ lateDeliveries: 1, receiptReminders: 1 }); // still true, but…
    // …the notifications themselves were not duplicated
    expect(await db.notification.count({ where: { userId: proc.id, dedupeKey: { startsWith: "po-overdue:" } } })).toBe(1);
    expect(await db.notification.count({ where: { userId: w.aManager.id, dedupeKey: { startsWith: "po-overdue-dealer:" } } })).toBe(1);
    expect(await db.notification.count({ where: { userId: w.aManager.id, dedupeKey: { startsWith: "po-confirm-receipt:" } } })).toBe(1);
  });
});

describe("dealer ledger and payments", () => {
  async function invoiced(amount = 100000) {
    await as(proc.id);
    ok(await postLedgerEntryAction({ dealershipId: w.A.id, type: "INVOICE", direction: "DEBIT", amount, currency: "PKR", entryDate: new Date(), description: "Opening balance" }));
  }
  const payment = (amount: number, files: File[] = [pdf()]) => {
    const fd = new FormData();
    fd.set("amount", String(amount)); fd.set("entryDate", new Date().toISOString().slice(0, 10)); fd.set("method", "BANK_TRANSFER"); fd.set("reference", "TX-1"); fd.set("currency", "PKR");
    files.forEach((f, i) => { fd.set(`file_${i}`, f); fd.set(`kind_${i}`, "PROOF_OF_PAYMENT"); });
    return fd;
  };

  it("a reported payment waits for verification and only then reduces the balance", async () => {
    await invoiced(100000);
    await as(w.aManager.id);
    ok(await recordPaymentAction(w.A.id, payment(40000)));
    expect(await dealerBalance(w.A.id)).toMatchObject({ balance: 100000, pending: 40000, pendingCount: 1 });

    await as(proc.id);
    const entry = await db.ledgerEntry.findFirstOrThrow({ where: { type: "PAYMENT" } });
    ok(await verifyPaymentAction(entry.id));
    expect(await dealerBalance(w.A.id)).toMatchObject({ balance: 60000, pending: 0 });
    expect((await verifyPaymentAction(entry.id)).ok).toBe(false); // not twice
    expect((await rejectPaymentAction(entry.id, "too late")).ok).toBe(false);
    expect(await db.notification.count({ where: { userId: w.aManager.id, type: "LEDGER_UPDATE" } })).toBe(1);
  });

  it("a rejected payment never affects the balance", async () => {
    await invoiced(100000);
    await as(w.aManager.id);
    ok(await recordPaymentAction(w.A.id, payment(40000)));
    await as(proc.id);
    const entry = await db.ledgerEntry.findFirstOrThrow({ where: { type: "PAYMENT" } });
    ok(await rejectPaymentAction(entry.id, "Slip amount does not match"));
    expect((await dealerBalance(w.A.id)).balance).toBe(100000);
    const stmt = await ledgerStatement(w.A.id);
    expect(stmt.rows.map((r) => r.status).sort()).toEqual(["POSTED", "REJECTED"]);
    expect(stmt.closingBalance).toBe(100000);
  });

  it("requires proof of payment, and only dealership managers can report payments", async () => {
    await as(w.aManager.id);
    expect((await recordPaymentAction(w.A.id, payment(1000, []))).ok).toBe(false);
    await as(w.aRep.id);
    expect((await recordPaymentAction(w.A.id, payment(1000))).ok).toBe(false);
    await as(w.bManager.id);
    expect((await recordPaymentAction(w.A.id, payment(1000))).ok).toBe(false); // someone else's ledger
    expect(await db.ledgerEntry.count()).toBe(0);
  });

  it("a dealership cannot verify its own payment or post ledger entries", async () => {
    await invoiced();
    await as(w.aManager.id);
    ok(await recordPaymentAction(w.A.id, payment(500)));
    const entry = await db.ledgerEntry.findFirstOrThrow({ where: { type: "PAYMENT" } });
    expect((await verifyPaymentAction(entry.id)).ok).toBe(false);
    expect((await postLedgerEntryAction({ dealershipId: w.A.id, type: "CREDIT_NOTE", direction: "CREDIT", amount: 99999, currency: "PKR", entryDate: new Date(), description: "free money" })).ok).toBe(false);
    expect((await dealerBalance(w.A.id)).balance).toBe(100000);
  });

  it("the database refuses a ledger row that is both a debit and a credit", async () => {
    await expect(db.ledgerEntry.create({ data: { dealershipId: w.A.id, type: "ADJUSTMENT", description: "bad", debit: 5, credit: 5, recordedById: proc.id } })).rejects.toThrow();
  });

  it("builds a running-balance statement for a period", async () => {
    await as(proc.id);
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    ok(await postLedgerEntryAction({ dealershipId: w.A.id, type: "INVOICE", direction: "DEBIT", amount: 1000, currency: "PKR", entryDate: day(1), description: "Jan 1" }));
    ok(await postLedgerEntryAction({ dealershipId: w.A.id, type: "PAYMENT", direction: "CREDIT", amount: 300, currency: "PKR", entryDate: day(5), description: "Jan 5" }));
    ok(await postLedgerEntryAction({ dealershipId: w.A.id, type: "INVOICE", direction: "DEBIT", amount: 200, currency: "PKR", entryDate: day(10), description: "Jan 10" }));
    const s = await ledgerStatement(w.A.id, { from: day(5), to: day(31) });
    expect(s.openingBalance).toBe(1000);
    expect(s.rows.map((r) => r.balance)).toEqual([700, 900]);
    expect(s.closingBalance).toBe(900);
    expect([s.totalDebit, s.totalCredit]).toEqual([200, 300]);
  });

  it("exports Excel and PDF for the dealer's own ledger only", async () => {
    await invoiced();
    const call = (qs: string) => exportLedger(new NextRequest(`http://localhost/api/ledger/export?${qs}`));
    await as(w.aManager.id);
    const xlsx = await call(`format=xlsx&dealership=${w.A.id}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
    expect(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");
    const pdfRes = await call(`format=pdf&dealership=${w.A.id}`);
    expect(pdfRes.status).toBe(200);
    expect(Buffer.from(await pdfRes.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await call(`format=xlsx&dealership=${w.B.id}`)).status).toBe(404); // another dealership
    expect((await call(`scope=all&format=xlsx`)).status).toBe(404); // central only
    await as(w.aRep.id); // reps have no ledger access
    expect((await call(`format=xlsx&dealership=${w.A.id}`)).status).toBe(404);
    await as(proc.id);
    expect((await call(`format=xlsx&dealership=${w.A.id}`)).status).toBe(200);
    expect((await call(`scope=all&format=xlsx`)).status).toBe(200);
    session.current = null;
    expect((await call(`format=xlsx&dealership=${w.A.id}`)).status).toBe(404);
  });
});

describe("expense vouchers and their documents", () => {
  const voucher = (files: { file: File; kind: string }[] = [{ file: pdf("invoice.pdf"), kind: "INVOICE" }]) => {
    const fd = new FormData();
    fd.set("voucherDate", new Date().toISOString().slice(0, 10)); fd.set("category", "Rent & utilities"); fd.set("amount", "11800"); fd.set("taxAmount", "1800"); fd.set("payee", "Landlord");
    files.forEach((f, i) => { fd.set(`file_${i}`, f.file); fd.set(`kind_${i}`, f.kind); });
    return fd;
  };
  const fileReq = (id: string) => getFile(new NextRequest(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) });

  it("stores the invoice, proof of invoice and proof of payment with the voucher", async () => {
    await as(w.aManager.id);
    ok(await createVoucherAction(w.A.id, voucher([{ file: pdf("inv.pdf"), kind: "INVOICE" }, { file: pdf("poi.pdf"), kind: "PROOF_OF_INVOICE" }, { file: pdf("pop.pdf"), kind: "PROOF_OF_PAYMENT" }])));
    const v = await db.expenseVoucher.findFirstOrThrow({ include: { attachments: true } });
    expect(v.attachments.map((a) => a.kind).sort()).toEqual(["INVOICE", "PROOF_OF_INVOICE", "PROOF_OF_PAYMENT"]);
    expect(Number(v.taxAmount)).toBe(1800);
  });

  it("rejects a tax amount above the voucher amount and files whose content doesn't match their extension", async () => {
    await as(w.aManager.id);
    const bad = voucher();
    bad.set("taxAmount", "99999");
    expect((await createVoucherAction(w.A.id, bad)).ok).toBe(false);
    const fake = voucher([{ file: new File([Buffer.from("not really a pdf")], "evil.pdf"), kind: "INVOICE" }]);
    expect((await createVoucherAction(w.A.id, fake)).ok).toBe(false);
    expect(await db.expenseVoucher.count()).toBe(0);
  });

  it("serves voucher documents only to that dealership's finance users and to YADEA accounts", async () => {
    await as(w.aManager.id);
    ok(await createVoucherAction(w.A.id, voucher()));
    const att = await db.voucherAttachment.findFirstOrThrow();
    expect((await fileReq(att.fileId)).status).toBe(200);
    await as(w.aRep.id); // no voucher permission
    expect((await fileReq(att.fileId)).status).toBe(404);
    await as(w.bManager.id); // another dealership
    expect((await fileReq(att.fileId)).status).toBe(404);
    await as(w.staff.id); // CRM staff
    expect((await fileReq(att.fileId)).status).toBe(404);
    await as(proc.id);
    expect((await fileReq(att.fileId)).status).toBe(200);
    session.current = null;
    expect((await fileReq(att.fileId)).status).toBe(404);
  });

  it("YADEA accounts approve or reject with a reason; payment vouchers follow the ledger", async () => {
    await as(w.aManager.id);
    ok(await createVoucherAction(w.A.id, voucher()));
    const v = await db.expenseVoucher.findFirstOrThrow();
    await as(w.aManager.id);
    expect((await reviewVoucherAction(v.id, "APPROVED")).ok).toBe(false); // dealers can't review
    await as(proc.id);
    expect((await reviewVoucherAction(v.id, "REJECTED")).ok).toBe(false); // needs a reason
    ok(await reviewVoucherAction(v.id, "REJECTED", "Receipt unreadable"));
    expect((await reviewVoucherAction(v.id, "APPROVED")).ok).toBe(false); // already decided
    expect((await db.expenseVoucher.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("REJECTED");
  });
});

describe("dealership documents and certificates", () => {
  const upload = (category: string, title: string) => {
    const fd = new FormData();
    fd.set("category", category); fd.set("title", title); fd.set("file", pdf("cert.pdf"));
    return fd;
  };
  const fileReq = (id: string) => getFile(new NextRequest(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) });

  it("syncs the registration certificate both ways and keeps it private to the dealership and YADEA", async () => {
    await as(w.aManager.id);
    ok(await uploadDealerDocumentAction(w.A.id, upload("REGISTRATION_CERTIFICATE", "Certificate of registration")));
    const doc = await db.dealershipDocument.findFirstOrThrow();
    expect(doc.source).toBe("DEALERSHIP");
    await as(proc.id);
    expect((await fileReq(doc.fileId)).status).toBe(200); // YADEA sees what the dealer uploaded
    await as(w.bManager.id);
    expect((await fileReq(doc.fileId)).status).toBe(404);
    await as(w.aRep.id);
    expect((await fileReq(doc.fileId)).status).toBe(404);
  });

  it("only YADEA can issue achievement certificates, and the dealership is notified and can download it", async () => {
    await as(w.aManager.id);
    expect((await uploadDealerDocumentAction(w.A.id, upload("ACHIEVEMENT_CERTIFICATE", "Self-awarded"))).ok).toBe(false);
    expect((await uploadDealerDocumentAction(w.B.id, upload("OTHER", "Into someone else's folder"))).ok).toBe(false);
    await as(w.staff.id); // central but no dealerdocs.admin
    expect((await uploadDealerDocumentAction(w.A.id, upload("ACHIEVEMENT_CERTIFICATE", "Nope"))).ok).toBe(false);
    await as(proc.id);
    ok(await uploadDealerDocumentAction(w.A.id, upload("ACHIEVEMENT_CERTIFICATE", "Top Performer Q3")));
    const doc = await db.dealershipDocument.findFirstOrThrow();
    expect(doc.source).toBe("YADEA");
    expect(await db.notification.count({ where: { userId: w.aManager.id, type: "DOCUMENT_SHARED" } })).toBe(1);
    await as(w.aManager.id);
    expect((await fileReq(doc.fileId)).status).toBe(200);
    await as(w.bManager.id);
    expect((await fileReq(doc.fileId)).status).toBe(404);
  });
});

describe("dealership audit log", () => {
  it("every operational action is tagged with its dealership, so dealers can read only their own slice", async () => {
    await stock(w.A.id, `B:${bike.id}`, 5);
    await stock(w.B.id, `B:${bike.id}`, 5);
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "Ali", lines: [{ itemKey: `B:${bike.id}`, quantity: 1, unitPrice: 1 }], confirmNow: true }));
    const aLogs = await db.auditLog.findMany({ where: { dealershipId: w.A.id } });
    const bLogs = await db.auditLog.findMany({ where: { dealershipId: w.B.id } });
    expect(aLogs.map((l) => l.action)).toEqual(expect.arrayContaining(["inventory.item_added", "salesorder.created", "salesorder.confirmed"]));
    expect(aLogs.every((l) => l.userId === w.aManager.id || l.userId === w.aRep.id)).toBe(true);
    expect(bLogs.map((l) => l.action)).toEqual(["inventory.item_added"]);
    expect(await db.auditLog.count({ where: { action: { startsWith: "salesorder" }, OR: [{ dealershipId: null }, { dealershipId: { not: w.A.id } }] } })).toBe(0);
  });

  it("actions by YADEA staff on a dealership's data are visible to that dealership", async () => {
    await as(w.aManager.id);
    ok(await submitStockOrderAction(w.A.id, { priority: "NORMAL", lines: [{ itemKey: `B:${bike.id}`, quantity: 1 }] }));
    const o = await db.procurementOrder.findFirstOrThrow();
    await as(proc.id);
    ok(await approveOrderAction({ orderId: o.id, prices: {} }));
    const approved = await db.auditLog.findFirstOrThrow({ where: { action: "procurement.order_approved" } });
    expect(approved).toMatchObject({ dealershipId: w.A.id, userId: proc.id });
  });
});

describe("permission catalogue", () => {
  it("never grants dealership-only permissions to central roles", () => {
    for (const r of DEFAULT_ROLES.filter((x) => x.scope === "CENTRAL")) {
      expect(r.permissions.filter((p) => DEALER_ONLY_PERMISSIONS.includes(p)), r.key).toEqual([]);
    }
  });

  it("sync adds missing permissions and roles without restoring grants an administrator removed", async () => {
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "ledger.manage" } });
    await db.rolePermission.deleteMany({ where: { permissionId: perm.id } });
    await db.permission.delete({ where: { key: "ledger.manage" } });
    const removedFromMgmt = await db.permission.findUniqueOrThrow({ where: { key: "procurement.view" } });
    await db.rolePermission.deleteMany({ where: { permissionId: removedFromMgmt.id, roleId: w.roles.MANAGEMENT! } });
    const res = await syncPermissionCatalog();
    expect(res.permissionsCreated).toBe(1);
    // the brand-new permission reaches the roles that should hold it …
    const holders = await db.role.findMany({ where: { permissions: { some: { permission: { key: "ledger.manage" } } } }, select: { key: true } });
    expect(holders.map((h) => h.key).sort()).toEqual(["PROCUREMENT", "SUPER_ADMIN"]);
    // … but a grant removed earlier by an administrator stays removed
    expect(await db.rolePermission.count({ where: { permissionId: removedFromMgmt.id, roleId: w.roles.MANAGEMENT! } })).toBe(0);
    expect((await syncPermissionCatalog()).permissionsCreated).toBe(0);
  });

  it("applies a release's default-grant upgrades once and never overrides an administrator afterwards", async () => {
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "audit.view" } });
    await db.rolePermission.deleteMany({ where: { permissionId: perm.id, roleId: w.roles.DEALER_MANAGER! } }); // a database from before this release
    const bikeModels = await db.permission.findUniqueOrThrow({ where: { key: "bikemodels.manage" } });
    await db.rolePermission.deleteMany({ where: { permissionId: bikeModels.id, roleId: w.roles.PROCUREMENT! } }); // procurement didn't own bike models before the catalogue release
    const first = await syncPermissionCatalog();
    expect(first.upgradesApplied).toEqual(DEFAULT_GRANT_UPGRADES.map((u) => u.id)); // every release upgrade, each recorded once
    expect(first.upgradesApplied).toContain("2026-10-procurement-bike-models");
    expect(await db.rolePermission.count({ where: { permissionId: bikeModels.id, roleId: w.roles.PROCUREMENT! } })).toBe(1);
    expect(await db.rolePermission.count({ where: { permissionId: perm.id, roleId: w.roles.DEALER_MANAGER! } })).toBe(1);
    await db.rolePermission.deleteMany({ where: { permissionId: perm.id, roleId: w.roles.DEALER_MANAGER! } }); // the administrator removes it on purpose
    const second = await syncPermissionCatalog();
    expect(second.upgradesApplied).toEqual([]);
    expect(await db.rolePermission.count({ where: { permissionId: perm.id, roleId: w.roles.DEALER_MANAGER! } })).toBe(0);
  });
});
