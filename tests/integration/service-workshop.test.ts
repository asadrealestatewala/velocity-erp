import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { addStockItemAction } from "@/server/actions/inventory";
import {
  addJobCardPartAction, createServiceBookingAction, createWarrantyClaimAction, discardWarrantyClaimAction, openJobCardAction,
  removeJobCardPartAction, reviewWarrantyClaimAction, submitWarrantyClaimAction, updateJobCardAction, updateJobCardStatusAction,
  updateServiceBookingStatusAction,
} from "@/server/actions/service-workshop";
import { DEALER_ONLY_PERMISSIONS, DEFAULT_ROLES } from "@/lib/permissions";
import { asUser, buildWorld, futureSlot, type World } from "../support/fixtures";

let w: World;
let part: { id: string };

function ok<T extends { ok: boolean }>(r: T) {
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
}
const fail = (r: { ok: boolean }) => {
  expect(r.ok).toBe(false);
  return r as { ok: false; error: string };
};
const as = async (id: string) => { session.current = await asUser(id); };
const stockOf = async (dealershipId: string) => (await db.inventoryItem.findFirst({ where: { dealershipId, productId: part.id } }))?.quantity ?? 0;

async function openJob(over: Record<string, unknown> = {}) {
  await as(w.aManager.id);
  const r = ok(await openJobCardAction(w.A.id, { customerName: "Bilal Ahmed", plateNumber: "lea-123", complaint: "Brake noise", ...over }));
  return r.data!.id;
}

beforeEach(async () => {
  w = await buildWorld();
  part = await db.product.create({ data: { sku: "BRK-01", name: "Brake pad set", price: 1500, dealerPrice: 1000 } });
  await as(w.aManager.id);
  ok(await addStockItemAction(w.A.id, { itemKey: `P:${part.id}`, quantity: 10, reorderLevel: 0 }));
  session.current = null;
});

describe("permissions", () => {
  it("keeps service permissions off central roles except claim review, and grants them to the right dealership roles", () => {
    const role = (k: string) => DEFAULT_ROLES.find((r) => r.key === k)!;
    for (const p of ["service.view", "service.manage", "warranty.manage"] as const) {
      expect(DEALER_ONLY_PERMISSIONS).toContain(p);
      expect(role("SUPER_ADMIN").permissions).not.toContain(p);
    }
    expect(role("DEALER_MANAGER").permissions).toEqual(expect.arrayContaining(["service.view", "service.manage", "warranty.manage"]));
    expect(role("DEALER_REP").permissions).toContain("service.view");
    expect(role("DEALER_REP").permissions).not.toContain("service.manage");
    expect(role("SUPER_ADMIN").permissions).toContain("warranty.review");
    expect(role("DEALER_MANAGER").permissions).not.toContain("warranty.review");
  });

  it("refuses unauthenticated callers and users without the permission", async () => {
    expect(fail(await openJobCardAction(w.A.id, { customerName: "X Y", complaint: "Noise" })).error).toMatch(/session|sign in/i);
    await as(w.aRep.id);
    expect(fail(await openJobCardAction(w.A.id, { customerName: "X Y", complaint: "Noise" })).error).toMatch(/permission/i);
    await as(w.staff.id);
    expect(fail(await openJobCardAction(w.A.id, { customerName: "X Y", complaint: "Noise" })).error).toMatch(/permission/i);
  });
});

describe("bookings", () => {
  const slot = () => futureSlot(2, "10:00");

  it("books, confirms and cancels, and refuses impossible transitions", async () => {
    await as(w.aManager.id);
    const b = ok(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", plateNumber: "abc-1", serviceType: "Free service", ...slot() }));
    const row = await db.serviceBooking.findUniqueOrThrow({ where: { id: b.data!.id } });
    expect(row).toMatchObject({ status: "REQUESTED", dealershipId: w.A.id, plateNumber: "ABC-1" });
    ok(await updateServiceBookingStatusAction(row.id, { status: "CONFIRMED" }));
    ok(await updateServiceBookingStatusAction(row.id, { status: "CANCELLED", reason: "Customer called" }));
    expect(fail(await updateServiceBookingStatusAction(row.id, { status: "CONFIRMED" })).error).toMatch(/can't be changed/);
    expect(await db.auditLog.count({ where: { entityType: "ServiceBooking", entityId: row.id } })).toBe(3);
  });

  it("rejects a booking in the past, and a technician from another dealership", async () => {
    await as(w.aManager.id);
    expect(fail(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", serviceType: "Repair", date: "2020-01-01", time: "10:00" })).ok).toBe(false);
    expect(fail(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", serviceType: "Repair", ...slot(), assignedUserId: w.bRep.id })).error).toMatch(/not a member/);
  });

  it("cannot book into, or touch bookings of, another dealership", async () => {
    await as(w.bManager.id);
    expect(fail(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", serviceType: "Repair", ...slot() })).error).toMatch(/own dealership/);
    await as(w.aManager.id);
    const b = ok(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", serviceType: "Repair", ...slot() }));
    await as(w.bManager.id);
    expect(fail(await updateServiceBookingStatusAction(b.data!.id, { status: "CANCELLED" })).error).toMatch(/not found/i);
  });

  it("checking in opens a job card carrying the booking's customer and vehicle, once", async () => {
    await as(w.aManager.id);
    const b = ok(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", plateNumber: "abc-1", vehicleLabel: "Model One", serviceType: "Repair", ...slot(), confirmNow: true }));
    const job = ok(await openJobCardAction(w.A.id, { customerName: "ignored", complaint: "Won't charge" }, b.data!.id));
    const jc = await db.jobCard.findUniqueOrThrow({ where: { id: job.data!.id } });
    expect(jc).toMatchObject({ customerName: "Sara Malik", plateNumber: "ABC-1", vehicleLabel: "Model One", bookingId: b.data!.id });
    expect((await db.serviceBooking.findUniqueOrThrow({ where: { id: b.data!.id } })).status).toBe("CHECKED_IN");
    expect(fail(await openJobCardAction(w.A.id, { customerName: "x y", complaint: "Again" }, b.data!.id)).error).toMatch(/can't be checked in/);
    // Delivering the job completes the booking.
    ok(await updateJobCardAction(jc.id, { workDone: "Charger replaced", labourCharge: 500, discount: 0, isWarranty: false }));
    ok(await updateJobCardStatusAction(jc.id, { status: "COMPLETED" }));
    ok(await updateJobCardStatusAction(jc.id, { status: "DELIVERED" }));
    expect((await db.serviceBooking.findUniqueOrThrow({ where: { id: b.data!.id } })).status).toBe("COMPLETED");
  });

  it("another dealership's booking cannot be checked in", async () => {
    await as(w.aManager.id);
    const b = ok(await createServiceBookingAction(w.A.id, { customerName: "Sara Malik", serviceType: "Repair", ...slot() }));
    await as(w.bManager.id);
    expect(fail(await openJobCardAction(w.B.id, { customerName: "Sara Malik", complaint: "Noise" }, b.data!.id)).error).toMatch(/can't be checked in/);
  });
});

describe("job cards and spare parts", () => {
  it("consumes stock with an audited movement, prices the job, and returns stock when a part is removed", async () => {
    const id = await openJob();
    ok(await addJobCardPartAction(id, { productId: part.id, quantity: 2 }));
    expect(await stockOf(w.A.id)).toBe(8);
    const mv = await db.inventoryMovement.findFirstOrThrow({ where: { refType: "JobCard", refId: id } });
    expect(mv).toMatchObject({ delta: -2, reason: "SERVICE_USE", quantityAfter: 8, dealershipId: w.A.id });
    ok(await updateJobCardAction(id, { labourCharge: 700, discount: 200, isWarranty: false, workDone: "Pads replaced" }));
    expect(await db.jobCard.findUniqueOrThrow({ where: { id } })).toMatchObject({ partsTotal: expect.anything(), total: expect.anything() });
    const jc = await db.jobCard.findUniqueOrThrow({ where: { id } });
    expect([Number(jc.partsTotal), Number(jc.total)]).toEqual([3000, 3500]);

    const line = await db.jobCardPart.findFirstOrThrow({ where: { jobCardId: id } });
    ok(await removeJobCardPartAction(id, line.id));
    expect(await stockOf(w.A.id)).toBe(10);
    expect(await db.inventoryMovement.count({ where: { refType: "JobCard", refId: id } })).toBe(2);
    expect(Number((await db.jobCard.findUniqueOrThrow({ where: { id } })).total)).toBe(500);
  });

  it("refuses to use more than is in stock, leaving nothing behind", async () => {
    const id = await openJob();
    expect(fail(await addJobCardPartAction(id, { productId: part.id, quantity: 11 })).error).toMatch(/Not enough stock/);
    expect(await stockOf(w.A.id)).toBe(10);
    expect(await db.jobCardPart.count({ where: { jobCardId: id } })).toBe(0);
  });

  it("does not let two simultaneous requests overdraw stock", async () => {
    const id = await openJob();
    const id2 = await openJob({ plateNumber: "LEB-9" });
    const results = await Promise.all([addJobCardPartAction(id, { productId: part.id, quantity: 7 }), addJobCardPartAction(id2, { productId: part.id, quantity: 7 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await stockOf(w.A.id)).toBe(3);
  });

  it("needs a price when the part has none", async () => {
    const free = await db.product.create({ data: { sku: "X-1", name: "Unpriced bolt" } });
    await as(w.aManager.id);
    ok(await addStockItemAction(w.A.id, { itemKey: `P:${free.id}`, quantity: 5, reorderLevel: 0 }));
    const id = await openJob();
    expect(fail(await addJobCardPartAction(id, { productId: free.id, quantity: 1 })).error).toMatch(/no price/);
    ok(await addJobCardPartAction(id, { productId: free.id, quantity: 1, unitPrice: 40 }));
  });

  it("cancelling returns every part to stock, and a closed job cannot be edited", async () => {
    const id = await openJob();
    ok(await addJobCardPartAction(id, { productId: part.id, quantity: 4 }));
    ok(await updateJobCardStatusAction(id, { status: "CANCELLED", reason: "Customer left" }));
    expect(await stockOf(w.A.id)).toBe(10);
    expect(await db.jobCardPart.count({ where: { jobCardId: id } })).toBe(0);
    expect(fail(await addJobCardPartAction(id, { productId: part.id, quantity: 1 })).error).toMatch(/only be added while/);
    expect(fail(await updateJobCardStatusAction(id, { status: "IN_PROGRESS" })).error).toMatch(/can't move/);
  });

  it("enforces the workflow and requires work to be recorded before completion", async () => {
    const id = await openJob();
    expect(fail(await updateJobCardStatusAction(id, { status: "DELIVERED" })).error).toMatch(/can't move/);
    expect(fail(await updateJobCardStatusAction(id, { status: "COMPLETED" })).error).toMatch(/diagnosis or the work done/);
    ok(await updateJobCardStatusAction(id, { status: "IN_PROGRESS" }));
    ok(await updateJobCardStatusAction(id, { status: "AWAITING_PARTS" }));
    ok(await updateJobCardAction(id, { diagnosis: "Worn pads", labourCharge: 0, discount: 0, isWarranty: false }));
    ok(await updateJobCardStatusAction(id, { status: "COMPLETED" }));
    expect((await db.jobCard.findUniqueOrThrow({ where: { id } })).completedAt).not.toBeNull();
    // Edits are locked once the job is ready for delivery; reopening unlocks them.
    expect(fail(await updateJobCardAction(id, { labourCharge: 1, discount: 0, isWarranty: false })).error).toMatch(/closed/);
    ok(await updateJobCardStatusAction(id, { status: "IN_PROGRESS" }));
    ok(await updateJobCardAction(id, { labourCharge: 1, discount: 0, isWarranty: false }));
  });

  it("rejects a discount larger than labour plus parts", async () => {
    const id = await openJob();
    expect(fail(await updateJobCardAction(id, { labourCharge: 100, discount: 500, isWarranty: false })).error).toMatch(/discount/i);
  });

  it("is isolated per dealership: another dealership cannot see or change the job or its parts", async () => {
    const id = await openJob();
    ok(await addJobCardPartAction(id, { productId: part.id, quantity: 1 }));
    const line = await db.jobCardPart.findFirstOrThrow({ where: { jobCardId: id } });
    await as(w.bManager.id);
    for (const r of [
      await updateJobCardAction(id, { labourCharge: 1, discount: 0, isWarranty: false }),
      await updateJobCardStatusAction(id, { status: "CANCELLED" }),
      await addJobCardPartAction(id, { productId: part.id, quantity: 1 }),
      await removeJobCardPartAction(id, line.id),
    ]) expect(fail(r).error).toMatch(/not found/i);
    expect(await stockOf(w.A.id)).toBe(9);
  });

  it("writes an audit entry tagged to the dealership for each change", async () => {
    const id = await openJob();
    ok(await addJobCardPartAction(id, { productId: part.id, quantity: 1 }));
    const entries = await db.auditLog.findMany({ where: { entityType: "JobCard", entityId: id }, orderBy: { createdAt: "asc" } });
    expect(entries.map((e) => e.action)).toEqual(["service.job_opened", "service.part_added"]);
    expect(entries.every((e) => e.dealershipId === w.A.id && e.userId === w.aManager.id)).toBe(true);
  });
});

describe("warranty claims", () => {
  async function warrantyJob(finish = true) {
    const id = await openJob({ isWarranty: true });
    ok(await addJobCardPartAction(id, { productId: part.id, quantity: 1 }));
    ok(await updateJobCardAction(id, { labourCharge: 500, discount: 0, isWarranty: true, workDone: "Pads replaced under warranty" }));
    if (finish) ok(await updateJobCardStatusAction(id, { status: "COMPLETED" }));
    return id;
  }

  it("bills the customer nothing on a warranty job and claims labour plus parts", async () => {
    const id = await warrantyJob();
    const jc = await db.jobCard.findUniqueOrThrow({ where: { id } });
    expect([Number(jc.partsTotal), Number(jc.total)]).toEqual([1500, 0]);
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out at 800 km" }));
    const claim = await db.warrantyClaim.findUniqueOrThrow({ where: { id: c.data!.id } });
    expect(claim).toMatchObject({ status: "DRAFT", dealershipId: w.A.id, customerName: "Bilal Ahmed", plateNumber: "LEA-123" });
    expect(Number(claim.claimAmount)).toBe(2000);
  });

  it("only warranty jobs can be claimed, and only one live claim per job", async () => {
    const plain = await openJob();
    expect(fail(await createWarrantyClaimAction({ jobCardId: plain, failureDescription: "Pads worn out" })).error).toMatch(/Only warranty jobs/);
    const id = await warrantyJob();
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" }));
    expect(fail(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Again please" })).error).toMatch(/already has/);
    expect(fail(await updateJobCardAction(id, { labourCharge: 500, discount: 0, isWarranty: false })).error).toMatch(/closed|claim/);
    ok(await discardWarrantyClaimAction(c.data!.id));
    ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" }));
  });

  it("cannot claim more than was charged", async () => {
    const id = await warrantyJob();
    expect(fail(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out", claimAmount: 99999 })).error).toMatch(/can't exceed/);
    ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out", claimAmount: 1200 }));
  });

  it("claims a single part when asked to", async () => {
    const id = await warrantyJob();
    const line = await db.jobCardPart.findFirstOrThrow({ where: { jobCardId: id } });
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, jobCardPartId: line.id, failureDescription: "Pads worn out" }));
    expect(Number((await db.warrantyClaim.findUniqueOrThrow({ where: { id: c.data!.id } })).claimAmount)).toBe(1500);
  });

  it("is submitted only after the job is finished, notifies reviewers, and is then locked", async () => {
    const id = await warrantyJob(false);
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" }));
    expect(fail(await submitWarrantyClaimAction(c.data!.id)).error).toMatch(/Finish the job/);
    ok(await updateJobCardStatusAction(id, { status: "COMPLETED" }));
    ok(await submitWarrantyClaimAction(c.data!.id));
    expect(fail(await submitWarrantyClaimAction(c.data!.id)).error).toMatch(/already been submitted/);
    expect(fail(await discardWarrantyClaimAction(c.data!.id)).error).toMatch(/Only draft/);
    const note = await db.notification.findFirst({ where: { userId: w.admin.id, type: "WARRANTY_SUBMITTED" } });
    expect(note?.title).toMatch(/WC-/);
    expect(await db.notification.count({ where: { userId: w.aManager.id, type: "WARRANTY_SUBMITTED" } })).toBe(0);
  });

  it("is reviewed by central staff only, once, and the dealership manager hears the outcome", async () => {
    const id = await warrantyJob();
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" }));
    ok(await submitWarrantyClaimAction(c.data!.id));

    for (const who of [w.aManager.id, w.staff.id]) {
      await as(who);
      expect(fail(await reviewWarrantyClaimAction({ claimId: c.data!.id, decision: "APPROVED" })).error).toMatch(/permission/i);
    }
    await as(w.admin.id);
    expect(fail(await reviewWarrantyClaimAction({ claimId: c.data!.id, decision: "REJECTED" })).error).toMatch(/highlighted|reason/i);
    expect(fail(await reviewWarrantyClaimAction({ claimId: c.data!.id, decision: "APPROVED", approvedAmount: 99999 })).error).toMatch(/can't exceed/);
    ok(await reviewWarrantyClaimAction({ claimId: c.data!.id, decision: "APPROVED", approvedAmount: 1800, note: "Goodwill on labour" }));
    expect(fail(await reviewWarrantyClaimAction({ claimId: c.data!.id, decision: "REJECTED", note: "Changed my mind" })).error).toMatch(/already been reviewed/);

    const claim = await db.warrantyClaim.findUniqueOrThrow({ where: { id: c.data!.id } });
    expect(claim).toMatchObject({ status: "APPROVED", reviewedById: w.admin.id });
    expect(Number(claim.approvedAmount)).toBe(1800);
    expect(await db.notification.count({ where: { userId: w.aManager.id, type: "WARRANTY_REVIEWED" } })).toBe(1);
    expect((await db.auditLog.findMany({ where: { entityType: "WarrantyClaim", entityId: c.data!.id } })).map((e) => e.action).sort())
      .toEqual(["warranty.claim_approved", "warranty.claim_created", "warranty.claim_submitted"]);
  });

  it("a submitted claim's part cannot be removed from the job", async () => {
    const id = await warrantyJob(false);
    const line = await db.jobCardPart.findFirstOrThrow({ where: { jobCardId: id } });
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, jobCardPartId: line.id, failureDescription: "Pads worn out" }));
    ok(await updateJobCardStatusAction(id, { status: "COMPLETED" }));
    ok(await submitWarrantyClaimAction(c.data!.id));
    ok(await updateJobCardStatusAction(id, { status: "IN_PROGRESS" }));
    expect(fail(await removeJobCardPartAction(id, line.id)).error).toMatch(/submitted warranty claim/);
  });

  it("other dealerships cannot create, submit or discard claims on this one's jobs", async () => {
    const id = await warrantyJob();
    const c = ok(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" }));
    await as(w.bManager.id);
    expect(fail(await createWarrantyClaimAction({ jobCardId: id, failureDescription: "Pads worn out" })).error).toMatch(/not found/i);
    expect(fail(await submitWarrantyClaimAction(c.data!.id)).error).toMatch(/not found/i);
    expect(fail(await discardWarrantyClaimAction(c.data!.id)).error).toMatch(/not found/i);
  });
});
