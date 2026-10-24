import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { buildQuote, cancelAtPeriodEnd, confirmPayment, couponProblem, recordRefund, rejectPayment, submitLocalPayment } from "@/server/platform/billing";
import { billingState } from "@/server/platform/billing-state";
import { renderInvoicePdf } from "@/server/platform/invoice-pdf";
import { handleStripeEvent, verifyStripeSignature, encodeForm } from "@/server/platform/stripe";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { addDays } from "@/server/platform/subscriptions";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUG = "t-bill-co";
const EMAIL = "owner@t-bill-co.test";
let id = "";
const who = { source: "ADMIN" as const, actor: "operator@test", reason: "test" };
const tenant = () => platformDb().tenant.findUniqueOrThrow({ where: { id } });

async function cleanup() {
  const p = platformDb();
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await p.tenant.deleteMany({ where: { slug: SLUG } }); // cascades payments, invoices, history
  await p.coupon.deleteMany({ where: { code: { startsWith: "TST" } } });
  await p.billingEvent.deleteMany({ where: { eventId: { startsWith: "evt_test_" } } });
  await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  id = (await createWorkspace({ slug: SLUG, companyName: "Bill Co", ownerName: "Bea", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
  // a plan with a setup fee, so the first-payment rules can be tested without touching the seed prices
  const growth = await platformDb().plan.findUniqueOrThrow({ where: { key: "growth" } });
  await platformDb().planPrice.updateMany({ where: { planId: growth.id, currency: "PKR", interval: "MONTH", isActive: true }, data: { setupFee: 5000 } });
  await platformDb().coupon.createMany({
    data: [
      { code: "TST10", percentOff: 10, firstPaymentOnly: true },
      { code: "TSTFLAT", amountOff: 1000, currency: "PKR", firstPaymentOnly: false },
      { code: "TSTSTARTER", percentOff: 50, planKey: "starter" },
      { code: "TSTOLD", percentOff: 50, validTo: new Date(Date.now() - 1000) },
      { code: "TSTONCE", percentOff: 50, maxUses: 1, uses: 1 },
    ],
  });
}, 120_000);
afterAll(async () => {
  const growth = await platformDb().plan.findUnique({ where: { key: "growth" } });
  if (growth) await platformDb().planPrice.updateMany({ where: { planId: growth.id }, data: { setupFee: 0 } });
  await cleanup();
});

describe("quotes are computed by the server", () => {
  it("charges the plan price plus a one-time setup fee on the first payment only", async () => {
    const t = await tenant();
    expect(await buildQuote(t, { planKey: "growth", interval: "MONTH" })).toMatchObject({ base: 29_900, setupFee: 5_000, discount: 0, total: 34_900, currency: "PKR" });
    expect(await buildQuote(t, { planKey: "growth", interval: "YEAR" })).toMatchObject({ base: 299_000, setupFee: 0, total: 299_000 });
  });

  it("applies percent and fixed coupons and explains why a coupon cannot be used", async () => {
    const t = await tenant();
    expect(await buildQuote(t, { planKey: "growth", interval: "MONTH", couponCode: "tst10" })).toMatchObject({ coupon: "TST10", discount: 3_490, total: 31_410 });
    expect(await buildQuote(t, { planKey: "growth", interval: "MONTH", couponCode: "TSTFLAT" })).toMatchObject({ discount: 1_000, total: 33_900 });
    for (const [code, msg] of [["TSTSTARTER", /only applies to the starter plan/i], ["TSTOLD", /expired/i], ["TSTONCE", /fully used/i], ["NOPE", /not valid/i]] as const) {
      const q = await buildQuote(t, { planKey: "growth", interval: "MONTH", couponCode: code });
      expect(q.coupon).toBeNull();
      expect(q.couponMessage).toMatch(msg);
      expect(q.total).toBe(34_900);
    }
    expect(couponProblem(null, { planKey: "growth", interval: "MONTH", currency: "PKR", firstPayment: true })).toMatch(/not valid/);
  });

  it("rejects unknown plans and plans without a price in the workspace currency", async () => {
    const t = await tenant();
    await expect(buildQuote(t, { planKey: "nope", interval: "MONTH" })).rejects.toThrow(/not available/);
    await expect(buildQuote(t, { planKey: "growth", interval: "MONTH", currency: "EUR" })).rejects.toThrow(/no monthly price in EUR/);
  });
});

describe("bank / wallet payments: submit → operator confirms → plan active", () => {
  it("records the amount the server computed (not anything the client sends) and blocks re-used references", async () => {
    const t = await tenant();
    const p = await submitLocalPayment(t, { method: "JAZZCASH", reference: "JC-TEST-0001", planKey: "growth", interval: "MONTH", couponCode: "TST10" });
    expect(p).toMatchObject({ status: "PENDING", amount: 31_410, currency: "PKR" });
    await expect(submitLocalPayment(t, { method: "JAZZCASH", reference: "JC-TEST-0002", planKey: "growth", interval: "MONTH" })).rejects.toThrow(/already have a payment waiting/);
    await rejectPayment(p.id, "Reference not found in our account", who);
    expect((await platformDb().payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("REJECTED");
    await expect(rejectPayment(p.id, "again", who)).rejects.toThrow(/already been decided/);
    await expect(submitLocalPayment(t, { method: "JAZZCASH", reference: "JC-TEST-0001", planKey: "growth", interval: "MONTH" })).rejects.toThrow(/already been used/);
    await expect(submitLocalPayment(t, { method: "STRIPE" as never, reference: "whatever-ref", planKey: "growth", interval: "MONTH" })).rejects.toThrow(/bank or wallet/);
    await expect(submitLocalPayment(t, { method: "RAAST", reference: "ab", planKey: "growth", interval: "MONTH" })).rejects.toThrow(/transaction ID/);
  });

  it("confirming activates the plan for one period, issues the invoice, counts the coupon and writes history", async () => {
    const t = await tenant();
    const p = await submitLocalPayment(t, { method: "RAAST", reference: "RAAST-TEST-7788", planKey: "growth", interval: "MONTH", couponCode: "TST10" });
    const inv = await confirmPayment(p.id, who);
    expect(inv).toMatchObject({ amount: 31_410, setupFee: 5_000, planKey: "growth", status: "PAID", method: "RAAST", couponCode: "TST10" });
    expect(inv.number).toBeGreaterThan(0);
    const after = await tenant();
    expect(after).toMatchObject({ subStatus: "ACTIVE", planKey: "growth", interval: "MONTH", graceUntil: null });
    const days = Math.round((after.currentPeriodEnd!.getTime() - Date.now()) / 86_400_000);
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
    expect(billingState(after).locked).toBe(false);
    expect((await platformDb().coupon.findUniqueOrThrow({ where: { code: "TST10" } })).uses).toBe(1);
    expect((await platformDb().payment.findUniqueOrThrow({ where: { id: p.id } }))).toMatchObject({ status: "CONFIRMED", invoiceId: inv.id, decidedBy: "operator@test" });
    const last = await platformDb().subscriptionHistory.findFirstOrThrow({ where: { tenantId: id }, orderBy: { at: "desc" } });
    expect(last).toMatchObject({ toStatus: "ACTIVE", source: "ADMIN" });
    await expect(confirmPayment(p.id, who)).rejects.toThrow(/already been decided/);
  });

  it("paying early extends from the current end date, so no paid days are lost; setup fee is not charged again", async () => {
    const before = await tenant();
    const q = await buildQuote(before, { planKey: "growth", interval: "MONTH" });
    expect(q.setupFee).toBe(0);
    const p = await submitLocalPayment(before, { method: "BANK_TRANSFER", reference: "BANK-TEST-0099", planKey: "growth", interval: "MONTH" });
    await confirmPayment(p.id, who);
    const after = await tenant();
    const gained = Math.round((after.currentPeriodEnd!.getTime() - before.currentPeriodEnd!.getTime()) / 86_400_000);
    expect(gained).toBeGreaterThanOrEqual(28);
    expect(gained).toBeLessThanOrEqual(31);
  });
});

describe("refunds, invoices and cancellation", () => {
  it("records refunds separately and never beyond what was collected", async () => {
    const inv = await platformDb().invoice.findFirstOrThrow({ where: { tenantId: id }, orderBy: { issuedAt: "asc" } });
    await expect(recordRefund(inv.id, { amount: inv.amount + 1, reason: "too much" }, who)).rejects.toThrow(/At most/);
    await expect(recordRefund(inv.id, { amount: 100, reason: "" }, who)).rejects.toThrow(/reason/i);
    await recordRefund(inv.id, { amount: 1_410, reason: "Goodwill credit", method: "BANK_TRANSFER", reference: "RF-1" }, who);
    await expect(recordRefund(inv.id, { amount: inv.amount, reason: "second" }, who)).rejects.toThrow(/At most 30,000/);
    const reloaded = await platformDb().invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { refunds: true } });
    expect(reloaded.amount).toBe(inv.amount); // the invoice still shows what was collected
    expect(reloaded.refunds).toHaveLength(1);
  });

  it("renders a PDF invoice", async () => {
    const inv = await platformDb().invoice.findFirstOrThrow({ where: { tenantId: id }, include: { refunds: true } });
    const pdf = await renderInvoicePdf(inv, await tenant());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it("cancelling keeps full access until the paid period ends", async () => {
    await cancelAtPeriodEnd(id, who);
    const t = await tenant();
    expect(t).toMatchObject({ subStatus: "CANCELED", cancelAtPeriodEnd: true });
    expect(billingState(t)).toMatchObject({ locked: false });
    expect(billingState({ ...t, currentPeriodEnd: addDays(new Date(), -1) }).locked).toBe(true);
    await expect(cancelAtPeriodEnd(id, who)).rejects.toThrow(/Only an active subscription/);
  });
});

describe("Stripe", () => {
  const secret = "whsec_test_secret";
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  it("verifies webhook signatures and rejects tampered, wrong-secret and stale ones", () => {
    const body = JSON.stringify({ id: "evt_test_sig" });
    expect(verifyStripeSignature(body, sign(body), secret)).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(body), secret)).toBe(false);
    expect(verifyStripeSignature(body, sign(body), "other-secret")).toBe(false);
    expect(verifyStripeSignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600), secret)).toBe(false);
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
  });

  it("encodes nested checkout parameters the way Stripe expects", () => {
    expect(encodeForm({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], metadata: { plan: "growth" } }).join("&")).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bplan%5D=growth",
    );
  });

  it("activates on checkout.session.completed, ignores replays, and handles failures and cancellation", async () => {
    // start from an expired workspace
    await platformDb().tenant.update({ where: { id }, data: { subStatus: "EXPIRED", currentPeriodEnd: addDays(new Date(), -3), cancelAtPeriodEnd: false } });
    invalidateTenant(SLUG);
    const done = {
      id: "evt_test_1", type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", client_reference_id: id, payment_status: "paid", currency: "pkr", amount_total: 29_900 * 100, customer: "cus_test_1", subscription: "sub_test_1", metadata: { tenant_id: id, plan: "growth", interval: "MONTH" } } },
    };
    expect(await handleStripeEvent(done)).toBe("activated");
    expect(await handleStripeEvent(done)).toBe("duplicate");
    expect(await tenant()).toMatchObject({ subStatus: "ACTIVE", planKey: "growth", stripeCustomerId: "cus_test_1", stripeSubscriptionId: "sub_test_1" });
    expect(await platformDb().invoice.count({ where: { tenantId: id, method: "STRIPE" } })).toBe(1);

    expect(await handleStripeEvent({ id: "evt_test_2", type: "invoice.payment_failed", data: { object: { subscription: "sub_test_1", customer: "cus_test_1" } } })).toBe("past_due");
    const pd = await tenant();
    expect(pd.subStatus).toBe("PAST_DUE");
    expect(pd.graceUntil!.getTime()).toBeGreaterThan(Date.now());

    const periodEnd = Math.floor(addDays(new Date(), 31).getTime() / 1000);
    expect(await handleStripeEvent({ id: "evt_test_3", type: "invoice.paid", data: { object: { id: "in_test_3", subscription: "sub_test_1", customer: "cus_test_1", billing_reason: "subscription_cycle", currency: "pkr", amount_paid: 29_900 * 100, lines: { data: [{ period: { end: periodEnd } }] } } } })).toBe("renewed");
    expect(await tenant()).toMatchObject({ subStatus: "ACTIVE", graceUntil: null });

    expect(await handleStripeEvent({ id: "evt_test_4", type: "customer.subscription.deleted", data: { object: { id: "sub_test_1" } } })).toBe("canceled");
    expect((await tenant()).subStatus).toBe("CANCELED");
    expect(await handleStripeEvent({ id: "evt_test_5", type: "something.else", data: { object: {} } })).toBe("ignored");
  });
});
