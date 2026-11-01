import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.3", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { addStockItemAction } from "@/server/actions/inventory";
import { cancelSalesOrderAction, createSalesOrderAction } from "@/server/actions/sales-orders";
import { addVehicleAction, assignVehicleAction, setRegistrationAction } from "@/server/actions/vehicles";
import { listVehicles, vehiclesForContact } from "@/server/services/vehicles";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
let contactId: string;
const as = async (id: string) => { session.current = await asUser(id); };
function ok<T extends { ok: boolean }>(r: T) {
  expect(r).toMatchObject({ ok: true });
  return r;
}
const unit = (chassisNumber: string, extra: Record<string, unknown> = {}) => ({ bikeModelId: w.m1.id, chassisNumber, engineNumber: "E-" + chassisNumber, color: "Red", ...extra });

beforeEach(async () => {
  w = await buildWorld();
  const r = await db.$transaction(async (tx) => {
    const c = await tx.contact.create({ data: { firstName: "Sana", phone: "03005556666" } });
    const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "TEST_DRIVE", interestedModelId: w.m1.id });
    await assignLead(tx, { leadId: l.id, dealershipId: w.A.id, userId: w.aRep.id, type: "MANUAL" });
    return c.id;
  });
  contactId = r;
  await as(w.aManager.id);
  ok(await addStockItemAction(w.A.id, { itemKey: `B:${w.m1.id}`, quantity: 3, reorderLevel: 0 }));
});

async function soldOrder(qtyOrdered = 1) {
  await as(w.aRep.id);
  ok(await createSalesOrderAction(w.A.id, { contactId, lines: [{ itemKey: `B:${w.m1.id}`, quantity: qtyOrdered, unitPrice: 100000 }], confirmNow: true }));
  return db.salesOrder.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
}

describe("vehicle units", () => {
  it("records a unit, normalises the chassis number and rejects duplicates", async () => {
    await as(w.aManager.id);
    ok(await addVehicleAction(w.A.id, unit("lb 1234 5abc")));
    expect((await db.vehicle.findFirstOrThrow()).chassisNumber).toBe("LB12345ABC");
    const dup = await addVehicleAction(w.A.id, unit("LB12345ABC"));
    expect(dup).toMatchObject({ ok: false });
    expect(await db.vehicle.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "vehicle.added", dealershipId: w.A.id } })).toBe(1);
    // the quantity ledger is untouched
    expect((await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id } })).quantity).toBe(3);
  });

  it("is limited to the user's own dealership and the right permission", async () => {
    await as(w.bManager.id);
    expect(await addVehicleAction(w.A.id, unit("CHASSIS-A1"))).toMatchObject({ ok: false });
    await as(w.aRep.id);
    expect(await addVehicleAction(w.A.id, unit("CHASSIS-A2"))).toMatchObject({ ok: false });
    expect(await db.vehicle.count()).toBe(0);
  });

  it("sells a unit to the order's customer, tracks the plate and shows it in their history", async () => {
    await as(w.aManager.id);
    ok(await addVehicleAction(w.A.id, unit("CHASSIS-001")));
    const v = await db.vehicle.findFirstOrThrow();
    const order = await soldOrder();
    await as(w.aRep.id);
    ok(await assignVehicleAction(w.A.id, { vehicleId: v.id, salesOrderId: order.id }));
    expect(await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ status: "SOLD", ownerContactId: contactId, salesOrderId: order.id });

    // plate needs inventory.manage; a rep cannot, a manager can
    expect(await setRegistrationAction(w.A.id, { vehicleId: v.id, registrationStatus: "REGISTERED", plateNumber: "lea 21 1234" })).toMatchObject({ ok: false });
    await as(w.aManager.id);
    ok(await setRegistrationAction(w.A.id, { vehicleId: v.id, registrationStatus: "REGISTERED", plateNumber: "lea 21 1234" }));
    const reg = await db.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(reg).toMatchObject({ registrationStatus: "REGISTERED", plateNumber: "LEA 21 1234" });
    expect(reg.registeredAt).not.toBeNull();

    const history = await vehiclesForContact(await asUser(w.aManager.id), contactId);
    expect(history.map((h) => h.chassisNumber)).toEqual(["CHASSIS-001"]);
    expect(await vehiclesForContact(await asUser(w.bManager.id), contactId)).toHaveLength(0);
    expect(await listVehicles(w.A.id, { q: "lea 21" })).toHaveLength(1);
    expect(await listVehicles(w.A.id, { q: "sana" })).toHaveLength(1);
  });

  it("refuses registering unsold units, wrong models and over-assignment", async () => {
    await as(w.aManager.id);
    ok(await addVehicleAction(w.A.id, unit("CHASSIS-001")));
    ok(await addVehicleAction(w.A.id, unit("CHASSIS-002")));
    ok(await addVehicleAction(w.A.id, unit("CHASSIS-003", { bikeModelId: w.m2.id })));
    const [v1, v2, v3] = await db.vehicle.findMany({ orderBy: { chassisNumber: "asc" } });
    // not yet sold → cannot register
    expect(await setRegistrationAction(w.A.id, { vehicleId: v1!.id, registrationStatus: "APPLIED", plateNumber: "ABC 1" })).toMatchObject({ ok: false });
    const order = await soldOrder(1);
    await as(w.aRep.id);
    ok(await assignVehicleAction(w.A.id, { vehicleId: v1!.id, salesOrderId: order.id }));
    expect(await assignVehicleAction(w.A.id, { vehicleId: v2!.id, salesOrderId: order.id })).toMatchObject({ ok: false }); // order covers 1 unit
    expect(await assignVehicleAction(w.A.id, { vehicleId: v3!.id, salesOrderId: order.id })).toMatchObject({ ok: false }); // other model
    expect(await db.vehicle.count({ where: { status: "SOLD" } })).toBe(1);
  });

  it("returns units to stock when their order is cancelled", async () => {
    await as(w.aManager.id);
    ok(await addVehicleAction(w.A.id, unit("CHASSIS-001")));
    const v = await db.vehicle.findFirstOrThrow();
    const order = await soldOrder();
    await as(w.aRep.id);
    ok(await assignVehicleAction(w.A.id, { vehicleId: v.id, salesOrderId: order.id }));
    ok(await cancelSalesOrderAction(order.id, "Customer changed mind"));
    expect(await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ status: "IN_STOCK", ownerContactId: null, salesOrderId: null, plateNumber: null });
    expect((await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id } })).quantity).toBe(3);
  });
});
