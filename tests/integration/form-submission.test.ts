import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { db } from "@/lib/db";
import { processSubmission } from "@/server/services/form-submission";
import { GET as optionsGET } from "@/app/api/public/options/route";
import { buildWorld, testDriveRaw, type World } from "../support/fixtures";
import type { NextRequest } from "next/server";

let w: World;
const submit = (raw: Record<string, string>, key = randomUUID(), slug = "test-drive", files: Record<string, File[]> = {}) =>
  processSubmission({ slug, raw, files, idempotencyKey: key, meta: { ipHash: "h", userAgent: "vitest" } });
const outlets = async (q: string) => {
  const res = await optionsGET({ nextUrl: new URL(`http://x/api/public/options?${q}`) } as unknown as NextRequest);
  return ((await res.json()) as { options: { id: string; name: string }[] }).options;
};

beforeEach(async () => {
  w = await buildWorld();
});

describe("city → outlet lookup", () => {
  it("returns only active, lead-accepting outlets in the selected city", async () => {
    await db.dealership.create({ data: { code: "INACTIVE", name: "Closed outlet", cityId: w.lahore.id, status: "SUSPENDED", acceptsLeads: false } });
    await db.dealership.create({ data: { code: "PEND", name: "Pending outlet", cityId: w.lahore.id, status: "ACTIVE", acceptsLeads: false } });
    const list = await outlets(`source=outlets&cityId=${w.lahore.id}`);
    expect(list.map((o) => o.id).sort()).toEqual([w.A.id, w.B.id].sort());
    expect((await outlets(`source=outlets&cityId=${w.karachi.id}`)).map((o) => o.id)).toEqual([w.K.id]);
    expect(await outlets(`source=outlets&cityId=${w.multan.id}`)).toEqual([]);
  });
  it("filters outlets by model eligibility when a model is chosen", async () => {
    const list = await outlets(`source=outlets&cityId=${w.lahore.id}&bikeModelId=${w.m2.id}`);
    expect(list.map((o) => o.id)).toEqual([w.A.id]); // B is not configured for Model Two
  });
  it("never exposes customer data", async () => {
    const res = await optionsGET({ nextUrl: new URL(`http://x/api/public/options?source=outlets&cityId=${w.lahore.id}`) } as unknown as NextRequest);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/phone|email|lead/i);
  });
});

describe("test-drive submission processing", () => {
  it("creates the submission, contact, lead, booking and an automatic assignment to the selected outlet", async () => {
    const r = await submit(testDriveRaw(w));
    expect(r.ok).toBe(true);
    const s = await db.formSubmission.findFirstOrThrow({ include: { lead: { include: { assignmentHistory: true } }, contact: true, testDrive: true, formVersion: true } });
    expect(s.status).toBe("PROCESSED");
    expect(s.formVersion.version).toBe(1);
    expect(s.consentGiven).toBe(true);
    expect(s.consentText).toMatch(/Privacy Policy/);
    expect(s.contact!.phoneNormalized).toBe("923001234567");
    expect(s.lead!.dealershipId).toBe(w.A.id);
    expect(s.lead!.origin).toBe("COMPANY");
    expect(s.lead!.assignmentHistory).toHaveLength(1);
    expect(s.lead!.assignmentHistory[0]).toMatchObject({ type: "AUTOMATIC", toDealershipId: w.A.id, reason: "Customer selected this outlet" });
    expect(s.testDrive).toMatchObject({ status: "REQUESTED", dealershipId: w.A.id, bikeModelId: w.m1.id }); // never auto-confirmed
    // Dealership A users are notified; dealership B users are not.
    const notified = await db.notification.findMany({ select: { userId: true } });
    const ids = new Set(notified.map((n) => n.userId));
    expect(ids.has(w.aManager.id)).toBe(true);
    expect(ids.has(w.bManager.id)).toBe(false);
    expect(ids.has(w.bRep.id)).toBe(false);
  });

  it("rejects an outlet that does not belong to the selected city", async () => {
    const r = await submit(testDriveRaw(w, { city: w.karachi.id, outlet: w.A.id }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.outlet).toMatch(/no longer available/);
    expect(await db.lead.count()).toBe(0);
  });

  it("rejects an outlet that became inactive between selection and submission", async () => {
    await db.dealership.update({ where: { id: w.A.id }, data: { acceptsLeads: false } });
    const r = await submit(testDriveRaw(w));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.outlet).toBeTruthy();
    expect(await db.formSubmission.count()).toBe(0);
  });

  it("rejects a model the outlet is not configured for", async () => {
    const r = await submit(testDriveRaw(w, { outlet: w.B.id, bike_model: w.m2.id }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.outlet).toMatch(/model/);
  });

  it("does not silently assign to an unrelated dealership when the city has no outlet", async () => {
    const r = await submit(testDriveRaw(w, { city: w.multan.id, outlet: "" }));
    expect(r.ok).toBe(false);
    expect(await db.lead.count()).toBe(0);
  });

  it("is idempotent: reprocessing the same submission key creates nothing new", async () => {
    const key = randomUUID();
    const a = await submit(testDriveRaw(w), key);
    const b = await submit(testDriveRaw(w), key);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.submissionNumber).toBe(b.submissionNumber);
    expect(await db.formSubmission.count()).toBe(1);
    expect(await db.lead.count()).toBe(1);
    expect(await db.leadAssignmentHistory.count()).toBe(1);
    expect(await db.testDriveBooking.count()).toBe(1);
  });

  it("matches an existing contact by normalised phone instead of duplicating it", async () => {
    await submit(testDriveRaw(w));
    // Different formatting, different email, new submission key, 25h later → new inquiry on the same contact
    await db.formSubmission.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    await submit(testDriveRaw(w, { phone: "+92 300 123 4567", email: "other@example.com" }));
    expect(await db.contact.count()).toBe(1);
    expect(await db.lead.count()).toBe(2); // each inquiry retained
    expect(await db.formSubmission.count()).toBe(2);
  });

  it("flags a repeat submission within 24h as a duplicate and links it to the existing lead", async () => {
    await submit(testDriveRaw(w));
    const r = await submit(testDriveRaw(w));
    expect(r.ok).toBe(true);
    const subs = await db.formSubmission.findMany({ orderBy: { number: "asc" } });
    expect(subs[1]).toMatchObject({ status: "DUPLICATE", isDuplicate: true, duplicateOfId: subs[0]!.id, leadId: subs[0]!.leadId });
    expect(await db.lead.count()).toBe(1);
  });

  it("requires consent and validates fields on the server", async () => {
    const r = await submit(testDriveRaw(w, { consent: "", email: "bad", phone: "1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {})).toEqual(expect.arrayContaining(["consent", "email", "phone"]));
  });

  it("refuses submissions to unpublished forms", async () => {
    await db.form.update({ where: { id: w.forms.TEST_DRIVE }, data: { status: "UNPUBLISHED" } });
    const r = await submit(testDriveRaw(w));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/not currently accepting/) });
  });

  it("enforces outlet opening hours", async () => {
    await db.dealership.update({ where: { id: w.A.id }, data: { operatingHours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "10:00", close: "18:00" }])) } });
    const r = await submit(testDriveRaw(w, { test_drive_time: "20:30" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.test_drive_time).toMatch(/between 10:00 and 18:00/);
  });

  it("stores spam silently without creating CRM records", async () => {
    const r = await processSubmission({ slug: "test-drive", raw: testDriveRaw(w), files: {}, idempotencyKey: randomUUID(), meta: {}, spam: true });
    expect(r.ok).toBe(true);
    expect((await db.formSubmission.findFirstOrThrow()).status).toBe("SPAM");
    expect(await db.contact.count()).toBe(0);
  });

  it("keeps the schema version of historical submissions after the form is republished", async () => {
    await submit(testDriveRaw(w));
    const form = await db.form.findUniqueOrThrow({ where: { id: w.forms.TEST_DRIVE } });
    const v2 = await db.formVersion.create({ data: { formId: form.id, version: 2, schema: form.draftSchema!, settings: form.draftSettings! } });
    await db.form.update({ where: { id: form.id }, data: { publishedVersionId: v2.id } });
    await db.formSubmission.updateMany({ data: { createdAt: new Date(Date.now() - 48 * 3600_000) } });
    await submit(testDriveRaw(w, { phone: "0311 7654321", email: "new@example.com" }));
    const subs = await db.formSubmission.findMany({ orderBy: { number: "asc" }, include: { formVersion: true } });
    expect(subs.map((s) => s.formVersion.version)).toEqual([1, 2]);
  });
});

describe("general inquiry & dealership application", () => {
  it("routes a general inquiry by city to an eligible outlet", async () => {
    const r = await submit({ first_name: "Sara", phone: "0321 5555555", city: w.karachi.id, inquiry_category: "pricing", preferred_contact: "phone", message: "Price?", consent: "on" }, randomUUID(), "general-inquiry");
    expect(r.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow({ include: { assignmentHistory: true } });
    expect(lead.dealershipId).toBe(w.K.id);
    expect(lead.inquiryCategory).toBe("pricing");
    expect(lead.assignmentHistory[0]!.type).toBe("AUTOMATIC");
  });

  it("leaves a general inquiry unassigned (central queue) when the city has no outlet", async () => {
    const r = await submit({ first_name: "Omar", phone: "0322 5555555", city: w.multan.id, inquiry_category: "other", preferred_contact: "email", message: "Hi", consent: "on" }, randomUUID(), "general-inquiry");
    expect(r.ok).toBe(true);
    expect((await db.lead.findFirstOrThrow()).dealershipId).toBeNull();
  });

  it("creates a dealership application with documents and consent — never a dealership", async () => {
    const pdf = new File([Buffer.from("%PDF-1.4 test")], "profile.pdf", { type: "application/pdf" });
    const r = await submit(
      { salutation: "Mr.", first_name: "Rashid", last_name: "Ali", email: "r@example.com", phone: "0333 1111111", business_name: "Rashid Motors", business_address: "Main Rd", years_in_business: "7", oem_dealer: "yes", province: w.punjab.id, city: w.multan.id, consent: "on" },
      randomUUID(), "dealership-application", { attachments: [pdf] },
    );
    expect(r.ok).toBe(true);
    const app = await db.dealershipApplication.findFirstOrThrow({ include: { documents: { include: { file: true } }, history: true } });
    expect(app).toMatchObject({ status: "SUBMITTED", businessName: "Rashid Motors", yearsInBusiness: 7, isOemDealer: true, consentGiven: true });
    expect(app.documents[0]!.file.originalName).toBe("profile.pdf");
    expect(app.documents[0]!.file.isPublic).toBe(false);
    expect(app.history).toHaveLength(1);
    expect(await db.dealership.count({ where: { applicationId: app.id } })).toBe(0);
    expect(await db.contact.count()).toBe(0);
  });

  it("rejects disallowed upload types", async () => {
    const exe = new File([Buffer.from("MZ...")], "virus.exe");
    const r = await submit(
      { first_name: "X", last_name: "Y", email: "x@example.com", phone: "0333 2222222", business_name: "B", business_address: "A", years_in_business: "1", consent: "on" },
      randomUUID(), "dealership-application", { attachments: [exe] },
    );
    expect(r.ok).toBe(false);
    expect(await db.dealershipApplication.count()).toBe(0);
  });
});
