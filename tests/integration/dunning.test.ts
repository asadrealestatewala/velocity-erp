import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { runLifecycle } from "@/server/platform/lifecycle";
import { addDays, changeSubscription } from "@/server/platform/subscriptions";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";
import { handleStripeEvent } from "@/server/platform/stripe";
import { activatePlan, buildQuote, creditNoteNumber, recordRefund } from "@/server/platform/billing";
import { renderCreditNotePdf } from "@/server/platform/credit-note-pdf";
import { ensureDefaultPlans } from "@/server/platform/plans";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const SLUG = "t-dunning-co";
const EMAIL = "owner@t-dunning-co.test";
let id = "";
const reload = () => platformDb().tenant.findUniqueOrThrow({ where: { id } });
const notices = (prefix: string) => platformDb().lifecycleNotice.count({ where: { tenantId: id, key: { startsWith: prefix } } });
const set = (patch: Parameters<typeof changeSubscription>[1]) => changeSubscription(id, patch, { source: "ADMIN", actor: "test", reason: "setup" });
const failedEvent = (eventId: string, invoice: string) => ({ id: eventId, type: "invoice.payment_failed", data: { object: { id: invoice, number: "ABC-1", subscription: "sub_dun", customer: "cus_dun" } } });

async function cleanup() {
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await platformDb().tenant.deleteMany({ where: { slug: SLUG } });
  await platformDb().trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  await platformDb().billingEvent.deleteMany({ where: { eventId: { startsWith: "evt_dun" } } });
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  id = (await createWorkspace({ slug: SLUG, companyName: "Dunning Co", ownerName: "Dun", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
}, 120_000);
afterAll(cleanup);

describe("grace-period reminders", () => {
  it("reminds as the deadline approaches, once per day-mark", async () => {
    await set({ subStatus: "PAST_DUE", planKey: "growth", graceUntil: addDays(new Date(), 2.5) }); // 3 days left
    await runLifecycle();
    expect(await notices("grace:3:")).toBe(1);
    await runLifecycle();
    expect(await notices("grace:3:")).toBe(1);
    await set({ subStatus: "PAST_DUE", graceUntil: addDays(new Date(), 0.5) }); // 1 day left
    await runLifecycle();
    expect(await notices("grace:1:")).toBe(1);
    expect((await reload()).subStatus).toBe("PAST_DUE");
  });

  it("stays quiet on days that are not reminder days, then expires after grace", async () => {
    await set({ subStatus: "PAST_DUE", graceUntil: addDays(new Date(), 5.5) }); // 6 days left
    await runLifecycle();
    expect(await notices("grace:6:")).toBe(0);
    await set({ subStatus: "PAST_DUE", graceUntil: addDays(new Date(), -1) });
    await runLifecycle();
    expect((await reload()).subStatus).toBe("EXPIRED");
  });
});

describe("failed card payments", () => {
  it("first failure starts the grace period, retries do not extend it, and the owner is told once per invoice", async () => {
    await platformDb().tenant.update({ where: { id }, data: { stripeSubscriptionId: "sub_dun", stripeCustomerId: "cus_dun" } });
    await set({ subStatus: "ACTIVE", planKey: "growth", graceUntil: null });
    expect(await handleStripeEvent(failedEvent("evt_dun_1", "in_1"))).toBe("past_due");
    const first = (await reload()).graceUntil!;
    expect(first.getTime()).toBeGreaterThan(Date.now());
    // Stripe retries: the same invoice fails again later.
    await platformDb().tenant.update({ where: { id }, data: { graceUntil: new Date(first.getTime() - 3 * 86_400_000) } });
    expect(await handleStripeEvent(failedEvent("evt_dun_2", "in_1"))).toBe("past_due_already");
    expect((await reload()).graceUntil!.getTime()).toBe(first.getTime() - 3 * 86_400_000);
    expect(await notices("stripe-failed:in_1")).toBe(1);
    await handleStripeEvent(failedEvent("evt_dun_3", "in_2"));
    expect(await notices("stripe-failed:")).toBe(2);
  });
});

describe("credit notes", () => {
  it("numbers every refund and renders a PDF that references the invoice", async () => {
    const t = await reload();
    const q = await buildQuote(t, { planKey: "growth", interval: "MONTH" });
    const inv = await activatePlan(id, { ...q, coupon: null }, { method: "BANK_TRANSFER", reference: `dun-${Date.now()}`, who: { source: "ADMIN", actor: "test", reason: "test" } });
    const a = await recordRefund(inv.id, { amount: 100, reason: "Goodwill" }, { source: "ADMIN", actor: "test", reason: "x" });
    const b = await recordRefund(inv.id, { amount: 50, reason: "Duplicate charge" }, { source: "ADMIN", actor: "test", reason: "x" });
    expect(b.number).toBeGreaterThan(a.number);
    expect(creditNoteNumber(a.number)).toMatch(/^CN-\d{5}$/);
    const pdf = await renderCreditNotePdf(a, inv, await reload());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
