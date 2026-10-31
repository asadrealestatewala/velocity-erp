import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval, Tenant } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { platformDb } from "./client";
import { activatePlan, buildQuote } from "./billing";
import { decryptSecret } from "./crypto";
import { appBaseUrl, workspaceUrl } from "./mail";
import { getPlatformSettings } from "./settings";
import { addDays, changeSubscription } from "./subscriptions";
import { noticeOnce } from "./notices";
import { sendTemplate } from "./mail-send";

/**
 * Stripe over plain HTTPS (no SDK). Keys and price ids are entered in the platform console and stored encrypted;
 * nothing sensitive is read from, or exposed to, the browser. Card numbers never touch this server (hosted Checkout).
 */
async function creds() {
  const s = await getPlatformSettings();
  const secret = s.billing.stripeSecretKeyEnc ? decryptSecret(s.billing.stripeSecretKeyEnc) : process.env.STRIPE_SECRET_KEY || "";
  return { secret, settings: s };
}

export async function stripeConfigured() {
  const { secret, settings } = await creds();
  return !!secret && Object.keys(settings.billing.stripePrices).length > 0;
}

/** Stripe wants form-encoded bodies with bracketed keys for nesting. */
export function encodeForm(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? out.push(...encodeForm(x as Record<string, unknown>, `${key}[${i}]`)) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`)));
    else if (typeof v === "object") out.push(...encodeForm(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { secret } = await creds();
  if (!secret) throw new AppError("Card payments are not set up yet. Use a bank or wallet transfer, or contact support.");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: encodeForm(body).join("&") });
  const json = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) {
    console.error("[stripe]", path, json.error?.message);
    throw new AppError("The card payment service rejected the request. Please try again or use a bank transfer.");
  }
  return json;
}

/** Hosted Checkout for a subscription, tagged with the workspace id so the webhook knows who paid. */
export async function createCheckout(t: Tenant, input: { planKey: string; interval: BillingInterval; currency?: string; couponCode?: string | null }): Promise<string> {
  const { settings } = await creds();
  const priceId = settings.billing.stripePrices[`${input.planKey}_${input.interval}`];
  if (!priceId) throw new AppError("Card payment is not available for that plan yet.");
  const q = await buildQuote(t, input);
  const setupId = q.setupFee > 0 ? settings.billing.stripePrices[`${input.planKey}_setup`] : undefined;
  const session = await call<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }, ...(setupId ? [{ price: setupId, quantity: 1 }] : [])],
    success_url: workspaceUrl(t.slug, "/crm/billing?paid=1"),
    cancel_url: workspaceUrl(t.slug, "/crm/billing?canceled=1"),
    client_reference_id: t.id,
    ...(t.stripeCustomerId ? { customer: t.stripeCustomerId } : { customer_email: t.ownerEmail ?? undefined }),
    allow_promotion_codes: true,
    metadata: { tenant_id: t.id, plan: input.planKey, interval: input.interval, currency: q.currency },
    subscription_data: { metadata: { tenant_id: t.id, plan: input.planKey, interval: input.interval } },
  });
  return session.url;
}

export async function createPortal(t: Tenant): Promise<string> {
  if (!t.stripeCustomerId) throw new AppError("There is no card subscription to manage yet.");
  const s = await call<{ url: string }>("billing_portal/sessions", { customer: t.stripeCustomerId, return_url: workspaceUrl(t.slug, "/crm/billing") });
  return s.url;
}

/** Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.body" with the endpoint secret, 5-minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const given = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return given.some((g) => g.length === expected.length && timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
}

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

/** Idempotent: the same event id is processed once. Returns what happened (for logs and tests). */
export async function handleStripeEvent(ev: StripeEvent): Promise<string> {
  const db = platformDb();
  const fresh = await db.billingEvent.createMany({ data: [{ provider: "stripe", eventId: ev.id, type: ev.type, payload: ev as unknown as object }], skipDuplicates: true });
  if (fresh.count === 0) return "duplicate";
  const o = ev.data.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const findTenant = async () =>
    db.tenant.findFirst({ where: { OR: [{ id: String(o.client_reference_id ?? o.metadata?.tenant_id ?? "") }, { stripeSubscriptionId: String(o.subscription ?? o.id ?? "") }, { stripeCustomerId: String(o.customer ?? "") }] } });

  switch (ev.type) {
    case "checkout.session.completed": {
      const t = await findTenant();
      if (!t || o.payment_status === "unpaid") return "ignored";
      const interval = (o.metadata?.interval === "YEAR" ? "YEAR" : "MONTH") as BillingInterval;
      const currency = String(o.currency ?? t.currency).toUpperCase();
      const total = Math.round(Number(o.amount_total ?? 0) / 100);
      const q = await buildQuote(t, { planKey: String(o.metadata?.plan), interval, currency });
      await activatePlan(t.id, { ...q, total }, { method: "STRIPE", reference: String(o.id), who: { source: "WEBHOOK", reason: "Stripe checkout completed" }, stripe: { customerId: String(o.customer ?? ""), subscriptionId: String(o.subscription ?? "") } });
      return "activated";
    }
    case "invoice.paid": {
      const t = await db.tenant.findFirst({ where: { OR: [{ stripeSubscriptionId: String(o.subscription ?? "") }, { stripeCustomerId: String(o.customer ?? "") }] } });
      if (!t || !t.planKey || o.billing_reason === "subscription_create") return "ignored"; // first payment is handled by checkout.session.completed
      const lineEnd = o.lines?.data?.[0]?.period?.end;
      const q = await buildQuote(t, { planKey: t.planKey, interval: t.interval, currency: String(o.currency ?? t.priceCurrency).toUpperCase() });
      await activatePlan(t.id, { ...q, total: Math.round(Number(o.amount_paid ?? 0) / 100), setupFee: 0, coupon: null }, { method: "STRIPE", reference: String(o.id), who: { source: "WEBHOOK", reason: "Stripe renewal paid" }, periodEnd: lineEnd ? new Date(Number(lineEnd) * 1000) : undefined });
      return "renewed";
    }
    case "invoice.payment_failed": {
      const t = await db.tenant.findFirst({ where: { OR: [{ stripeSubscriptionId: String(o.subscription ?? "") }, { stripeCustomerId: String(o.customer ?? "") }] } });
      if (!t) return "ignored";
      const plan = t.planKey ? await db.plan.findUnique({ where: { key: t.planKey } }) : null;
      // Stripe retries a failed card several times: only the first failure starts the grace period, later ones must not extend it.
      const alreadyInGrace = t.subStatus === "PAST_DUE" && t.graceUntil !== null && t.graceUntil > new Date();
      if (!alreadyInGrace) await changeSubscription(t.id, { subStatus: "PAST_DUE", graceUntil: addDays(new Date(), plan?.graceDays ?? 7) }, { source: "WEBHOOK", reason: "Stripe reported a failed payment" });
      if (t.ownerEmail && (await noticeOnce(t.id, `stripe-failed:${String(o.id)}`))) {
        await sendTemplate("payment-failed", t.ownerEmail, { name: (t.ownerName ?? "there").split(" ")[0], workspaceName: t.name, reference: String(o.number ?? o.id), reason: "your card payment could not be completed. Please update your card or pay another way before the grace period ends.", billingUrl: workspaceUrl(t.slug, "/crm/billing") }, { tenantId: t.id }).catch(() => {});
      }
      return alreadyInGrace ? "past_due_already" : "past_due";
    }
    case "customer.subscription.deleted": {
      const t = await db.tenant.findFirst({ where: { stripeSubscriptionId: String(o.id) } });
      if (!t) return "ignored";
      await changeSubscription(t.id, { subStatus: "CANCELED", cancelAtPeriodEnd: true }, { source: "WEBHOOK", reason: "Subscription cancelled in Stripe" });
      return "canceled";
    }
    case "charge.refunded": {
      const inv = o.invoice ? await db.invoice.findFirst({ where: { reference: String(o.invoice) } }) : null;
      if (!inv) return "ignored";
      const refunded = Math.round(Number(o.amount_refunded ?? 0) / 100);
      const already = (await db.refund.aggregate({ where: { invoiceId: inv.id }, _sum: { amount: true } }))._sum.amount ?? 0;
      if (refunded > already) await db.refund.create({ data: { invoiceId: inv.id, amount: refunded - already, currency: inv.currency, reason: "Refunded in Stripe", method: "STRIPE", reference: String(o.id), actor: "stripe" } });
      return "refunded";
    }
    default:
      return "ignored";
  }
}

export const webhookUrl = () => `${appBaseUrl()}/api/platform/billing/webhook/stripe`;
