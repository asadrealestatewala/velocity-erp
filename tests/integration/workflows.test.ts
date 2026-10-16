import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.2" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { changeStageAction, logInteractionAction, scheduleFollowUpAction } from "@/server/actions/leads";
import { addNoteAction, createTaskAction, recordPaymentAction, setTaskStatusAction } from "@/server/actions/work";
import { createTestDriveAction, updateTestDriveStatusAction } from "@/server/actions/test-drives";
import { assignReviewerAction, convertApplicationAction, markOnboardingStepAction, setApplicationStatusAction } from "@/server/actions/applications";
import { setAcceptsLeadsAction, setDealershipModelsAction, setDealershipStatusAction } from "@/server/actions/dealerships";
import { addTeamMemberAction } from "@/server/actions/team";
import { createFormAction, publishFormAction, saveFormDraftAction, unpublishFormAction } from "@/server/actions/forms";
import { processSubmission } from "@/server/services/form-submission";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { runScheduledJobs } from "@/server/services/jobs";
import { asUser, buildWorld, futureSlot, type World } from "../support/fixtures";
import type { FormField, FormSettings } from "@/lib/forms/schema";

let w: World;
let lead: string, contact: string;

beforeEach(async () => {
  w = await buildWorld();
  const r = await db.$transaction(async (tx) => {
    const c = await tx.contact.create({ data: { firstName: "Customer", phone: "03001112222" } });
    const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "TEST_DRIVE", interestedModelId: w.m1.id });
    await assignLead(tx, { leadId: l.id, dealershipId: w.A.id, userId: w.aRep.id, type: "MANUAL" });
    return { lead: l.id, contact: c.id };
  });
  ({ lead, contact } = r);
  session.current = await asUser(w.aRep.id);
});

describe("lead stages", () => {
  it("records stage history and requires a loss reason", async () => {
    expect((await changeStageAction({ leadId: lead, stageId: w.stages.CONTACTED! })).ok).toBe(true);
    const noReason = await changeStageAction({ leadId: lead, stageId: w.stages.LOST! });
    expect(noReason).toMatchObject({ ok: false, fieldErrors: { lossReasonId: expect.any(String) } });
    expect((await changeStageAction({ leadId: lead, stageId: w.stages.LOST!, lossReasonId: w.loss.id, lossNotes: "Too pricey" })).ok).toBe(true);
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead }, include: { stageHistory: { orderBy: { changedAt: "asc" } } } });
    expect(l).toMatchObject({ stageId: w.stages.LOST, lossReasonId: w.loss.id, lossNotes: "Too pricey" });
    expect(l.lostAt).toBeInstanceOf(Date);
    expect(l.stageHistory.map((h) => h.toStageId)).toEqual([w.stages.NEW, w.stages.CONTACTED, w.stages.LOST]);
    expect(l.stageHistory[2]!.changedById).toBe(w.aRep.id);
  });

  it("conversion turns the same contact into a customer without duplicating it", async () => {
    await changeStageAction({ leadId: lead, stageId: w.stages.CONVERTED!, conversionValue: 250000, soldModelId: w.m1.id });
    expect(await db.contact.count()).toBe(1);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact } })).type).toBe("CUSTOMER");
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead } });
    expect(Number(l.conversionValue)).toBe(250000);
    expect(await db.gamificationEvent.count({ where: { type: "LEAD_CONVERTED" } })).toBe(1);
  });

  it("does not re-award points when a lead moves back and forth", async () => {
    await changeStageAction({ leadId: lead, stageId: w.stages.QUALIFIED! });
    await changeStageAction({ leadId: lead, stageId: w.stages.CONTACTED! });
    await changeStageAction({ leadId: lead, stageId: w.stages.QUALIFIED! });
    expect(await db.gamificationEvent.count({ where: { type: "STAGE_ADVANCED", leadId: lead } })).toBe(1);
  });
});

describe("activities, tasks, notes and payments", () => {
  it("logs an interaction and awards first-contact points exactly once", async () => {
    await logInteractionAction(contact, { type: "CALL_LOGGED", direction: "OUTBOUND", outcome: "Interested", leadId: lead });
    await logInteractionAction(contact, { type: "WHATSAPP_LOGGED", direction: "OUTBOUND", leadId: lead });
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead } });
    expect(l.firstContactedAt).toBeInstanceOf(Date);
    expect(await db.activity.count({ where: { leadId: lead, type: { in: ["CALL_LOGGED", "WHATSAPP_LOGGED"] } } })).toBe(2);
    expect(await db.gamificationEvent.count({ where: { type: "FIRST_CONTACT" } })).toBe(1);
  });

  it("creates and completes tasks; on-time completion is rewarded once", async () => {
    const r = await createTaskAction({ title: "Call back", type: "CALL", contactId: contact, leadId: lead, assignedToId: w.aRep.id, dueAt: new Date(Date.now() + 3600_000), priority: "HIGH", reminderMinutesBefore: 30 });
    expect(r.ok).toBe(true);
    const t = await db.task.findFirstOrThrow();
    expect(t.dealershipId).toBe(w.A.id);
    await setTaskStatusAction(t.id, "COMPLETED");
    await setTaskStatusAction(t.id, "OPEN");
    await setTaskStatusAction(t.id, "COMPLETED");
    expect(await db.gamificationEvent.count({ where: { type: { in: ["TASK_ON_TIME", "FOLLOW_UP_COMPLETED"] } } })).toBe(2);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
  });

  it("refuses to assign a task to someone outside the lead's dealership", async () => {
    const r = await createTaskAction({ title: "x", type: "CALL", contactId: contact, leadId: lead, assignedToId: w.bRep.id, dueAt: new Date(Date.now() + 3600_000), priority: "LOW", reminderMinutesBefore: null });
    expect(r.ok).toBe(false);
  });

  it("schedules a follow-up and the reminder jobs notify without duplicates", async () => {
    await scheduleFollowUpAction({ leadId: lead, dueAt: new Date(Date.now() + 20 * 60_000), type: "CALL" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead } })).nextFollowUpAt).toBeInstanceOf(Date);
    const first = await runScheduledJobs();
    const second = await runScheduledJobs();
    expect(first.reminders).toBe(1);
    expect(second.reminders).toBe(0);
    expect(first.email.sent).toBe(0); // no SMTP → nothing claimed as sent
    expect(await db.notification.count({ where: { type: "TASK_DUE" } })).toBe(1);
  });

  it("persists notes with author, pin and visibility", async () => {
    await addNoteAction(contact, lead, { body: "Prefers evening calls", isPinned: true, visibility: "CUSTOMER_SHAREABLE" });
    const n = await db.note.findFirstOrThrow();
    expect(n).toMatchObject({ authorId: w.aRep.id, isPinned: true, visibility: "CUSTOMER_SHAREABLE", dealershipId: w.A.id });
  });

  it("records payments accurately and restricts them to authorised roles", async () => {
    expect((await recordPaymentAction(contact, { type: "DEPOSIT", amount: 25000.5, currency: "PKR", paymentDate: new Date(), method: "CASH", status: "PAID" })).ok).toBe(false); // rep lacks payments.manage
    session.current = await asUser(w.aManager.id);
    const r = await recordPaymentAction(contact, { type: "BOOKING_FEE", amount: 25000.5, currency: "PKR", paymentDate: new Date(), method: "BANK_TRANSFER", status: "PENDING", transactionRef: "TX-1", leadId: lead });
    expect(r.ok).toBe(true);
    const p = await db.payment.findFirstOrThrow();
    expect(Number(p.amount)).toBe(25000.5);
    expect(p).toMatchObject({ status: "PENDING", isVerified: false, dealershipId: w.A.id, recordedById: w.aManager.id });
  });
});

describe("test drives", () => {
  it("schedules, enforces transitions, and completing advances the stage and awards points", async () => {
    const { date, time } = futureSlot(2, "12:00");
    const r = await createTestDriveAction({ contactId: contact, leadId: lead, dealershipId: w.A.id, bikeModelId: w.m1.id, date, time, confirmNow: false });
    expect(r.ok).toBe(true);
    const b = await db.testDriveBooking.findFirstOrThrow();
    expect(b.status).toBe("REQUESTED");
    expect((await updateTestDriveStatusAction({ bookingId: b.id, status: "COMPLETED" })).ok).toBe(false); // must be confirmed first
    expect((await updateTestDriveStatusAction({ bookingId: b.id, status: "CONFIRMED" })).ok).toBe(true);
    expect((await updateTestDriveStatusAction({ bookingId: b.id, status: "COMPLETED", feedback: "Loved it" })).ok).toBe(true);
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead } });
    expect(l.stageId).toBe(w.stages.TEST_DRIVE_COMPLETED);
    expect(await db.gamificationEvent.count({ where: { type: "TEST_DRIVE_COMPLETED" } })).toBe(1);
    expect(await db.userAchievement.count({ where: { userId: w.aRep.id } })).toBe(1); // threshold-1 badge in fixture
  });

  it("rejects ineligible models, closed hours and overlapping slots", async () => {
    session.current = await asUser(w.staff.id);
    const { date } = futureSlot(2);
    expect((await createTestDriveAction({ contactId: contact, leadId: lead, dealershipId: w.B.id, bikeModelId: w.m2.id, date, time: "12:00" })).ok).toBe(false);
    expect((await createTestDriveAction({ contactId: contact, leadId: lead, dealershipId: w.A.id, bikeModelId: w.m1.id, date, time: "23:30" })).ok).toBe(false);
    await db.dealership.update({ where: { id: w.A.id }, data: { testDriveSlotCapacity: 1 } });
    expect((await createTestDriveAction({ contactId: contact, leadId: lead, dealershipId: w.A.id, bikeModelId: w.m1.id, date, time: "15:00" })).ok).toBe(true);
    const clash = await createTestDriveAction({ contactId: contact, leadId: lead, dealershipId: w.A.id, bikeModelId: w.m1.id, date, time: "15:15" });
    expect(clash).toMatchObject({ ok: false, error: expect.stringMatching(/fully booked/) });
  });
});

describe("dealership application review & onboarding", () => {
  async function newApplication() {
    await processSubmission({
      slug: "dealership-application", idempotencyKey: randomUUID(), files: {}, meta: {},
      raw: { first_name: "Nida", last_name: "Ali", email: "nida@example.com", phone: "0333 4444444", business_name: "Nida Motors", business_address: "Road 1", years_in_business: "5", city: w.multan.id, province: w.punjab.id, consent: "on" },
    });
    return db.dealershipApplication.findFirstOrThrow();
  }

  it("audits status changes, requires reasons and keeps approval separate from activation", async () => {
    const app = await newApplication();
    session.current = await asUser(w.mgmt.id);
    expect((await assignReviewerAction(app.id, w.mgmt.id)).ok).toBe(true);
    expect((await setApplicationStatusAction(app.id, { status: "APPROVED", note: "x" })).ok).toBe(false); // must be under review first
    expect((await setApplicationStatusAction(app.id, { status: "UNDER_REVIEW" })).ok).toBe(true);
    expect((await setApplicationStatusAction(app.id, { status: "APPROVED" })).ok).toBe(false); // reason required
    expect((await setApplicationStatusAction(app.id, { status: "APPROVED", note: "Strong track record" })).ok).toBe(true);
    const a = await db.dealershipApplication.findUniqueOrThrow({ where: { id: app.id }, include: { history: true } });
    expect(a.history.map((h) => h.toStatus)).toEqual(["SUBMITTED", "UNDER_REVIEW", "APPROVED"]);
    expect(await db.auditLog.count({ where: { entityId: app.id, action: "application.status_changed" } })).toBe(2);
    expect(await db.dealership.count({ where: { applicationId: app.id } })).toBe(0); // approval ≠ dealership
    expect(await db.outboxMessage.count({ where: { to: "nida@example.com" } })).toBeGreaterThan(0);
  });

  it("onboarding: conversion needs verification, happens once, and leads stay off until fully set up", async () => {
    const app = await newApplication();
    session.current = await asUser(w.admin.id);
    await setApplicationStatusAction(app.id, { status: "UNDER_REVIEW" });
    await setApplicationStatusAction(app.id, { status: "APPROVED", note: "ok" });
    const conv = { name: "Nida Motors Multan", code: "MUL-01", type: "DEALERSHIP" as const, cityId: w.multan.id };
    expect((await convertApplicationAction(app.id, conv)).ok).toBe(false); // not verified
    await markOnboardingStepAction(app.id, "verified", true);
    const r = await convertApplicationAction(app.id, conv);
    expect(r.ok).toBe(true);
    expect((await convertApplicationAction(app.id, { ...conv, code: "MUL-02" })).ok).toBe(false); // no duplicate conversion
    const d = await db.dealership.findFirstOrThrow({ where: { applicationId: app.id } });
    expect(d).toMatchObject({ status: "PENDING", acceptsLeads: false, legalName: "Nida Motors", email: "nida@example.com" });

    expect((await setAcceptsLeadsAction(d.id, true)).ok).toBe(false); // not active, no manager, no models
    const invite = await addTeamMemberAction({ dealershipId: d.id, email: "nida@example.com", name: "Nida Ali", role: "MANAGER" });
    expect(invite.ok).toBe(true);
    if (invite.ok) expect(invite.data?.tempPassword).toBeTruthy();
    await setDealershipModelsAction(d.id, [w.m1.id]);
    await setDealershipStatusAction(d.id, "ACTIVE");
    expect((await setAcceptsLeadsAction(d.id, true)).ok).toBe(true);
    // The new manager only sees their own (empty) dealership
    const newManager = await db.user.findUniqueOrThrow({ where: { email: "nida@example.com" } });
    expect(newManager.mustChangePassword).toBe(true);
    expect((await asUser(newManager.id)).memberships.map((m) => m.dealershipId)).toEqual([d.id]);
  });
});

describe("form builder", () => {
  it("creates, publishes as a new version, and unpublishing blocks submissions", async () => {
    session.current = await asUser(w.admin.id);
    const c = await createFormAction({ name: "Event signup", slug: "event-signup", type: "CUSTOM", template: false });
    expect(c.ok).toBe(true);
    const id = c.ok ? c.data!.id : "";
    const form = await db.form.findUniqueOrThrow({ where: { id } });
    const fields = (form.draftSchema as { fields: FormField[] }).fields;
    const settings = form.draftSettings as FormSettings;
    // Adding a conditional field and saving
    const withExtra: FormField[] = [...fields, { id: "x1", key: "heard", type: "select", label: "How did you hear?", required: false, width: "half", options: [{ label: "Friend", value: "friend" }] }];
    expect((await saveFormDraftAction(id, { name: "Event signup", fields: withExtra, settings })).ok).toBe(true);
    expect((await saveFormDraftAction(id, { name: "Event signup", fields: [...withExtra, { ...withExtra[0]!, id: "dup" }], settings })).ok).toBe(false); // duplicate key
    expect((await publishFormAction(id)).ok).toBe(true);
    expect((await publishFormAction(id)).ok).toBe(true);
    expect(await db.formVersion.count({ where: { formId: id } })).toBe(2);
    const ok = await processSubmission({ slug: "event-signup", idempotencyKey: randomUUID(), files: {}, meta: {}, raw: { first_name: "Eve", phone: "0300 9999999", consent: "on", heard: "friend" } });
    expect(ok.ok).toBe(true);
    await unpublishFormAction(id);
    const blocked = await processSubmission({ slug: "event-signup", idempotencyKey: randomUUID(), files: {}, meta: {}, raw: { first_name: "Eve", phone: "0300 9999998", consent: "on" } });
    expect(blocked.ok).toBe(false);
  });

  it("a test-drive form cannot be published without the essential mapped fields", async () => {
    session.current = await asUser(w.admin.id);
    const c = await createFormAction({ name: "Bad TD", slug: "bad-td", type: "TEST_DRIVE", template: false });
    const id = c.ok ? c.data!.id : "";
    const r = await publishFormAction(id);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/outlet/i) });
  });
});
