import "server-only";
import type { BillingInterval, Coupon, Invoice, Payment, PaymentMethod, Tenant } from "@/generated/platform";
import { AppError } from "@/server/errors";
import { platformDb } from "./client";
import { renderMail, sendSystemMail, workspaceUrl } from "./mail";
import { listPlans, priceOf } from "./plans";
import { getPlatformSettings } from "./settings";
import { addInterval, changeSubscription, type Who } from "./subscriptions";

export const LOCAL_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "RAAST", "EASYPAISA", "JAZZCASH", "SADAPAY", "NAYAPAY"];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  STRIPE: "Card (Stripe)", BANK_TRANSFER: "Bank transfer", RAAST: "Raast", EASYPAISA: "Easypaisa", JAZZCASH: "JazzCash", SADAPAY: "SadaPay", NAYAPAY: "NayaPay", MANUAL: "Manual",
};

export type Quote = {
  planKey: string;
  planName: string;
  interval: BillingInterval;
  currency: string;
  base: number;
  setupFee: number;
  discount: number;
  total: number;
  coupon: string | null;
  couponMessage: string | null;
};

async function hasPaidBefore(tenantId: string) {
  return (await platformDb().invoice.count({ where: { tenantId, status: "PAID" } })) > 0;
}

/** Why a coupon cannot be used (null = it can). */
export function couponProblem(c: Coupon | null, ctx: { planKey: string; interval: BillingInterval; currency: string; firstPayment: boolean }, now = new Date()): string | null {
  if (!c || !c.isActive) return "That coupon code is not valid.";
  if (c.validFrom && c.validFrom > now) return "That coupon is not active yet.";
  if (c.validTo && c.validTo < now) return "That coupon has expired.";
  if (c.maxUses !== null && c.uses >= c.maxUses) return "That coupon has been fully used.";
  if (c.planKey && c.planKey !== ctx.planKey) return `That coupon only applies to the ${c.planKey} plan.`;
  if (c.interval && c.interval !== ctx.interval) return `That coupon only applies to ${c.interval === "YEAR" ? "yearly" : "monthly"} billing.`;
  if (c.amountOff && c.currency && c.currency !== ctx.currency) return `That coupon is only valid for ${c.currency} payments.`;
  if (c.firstPaymentOnly && !ctx.firstPayment) return "That coupon is only valid on a first payment.";
  return null;
}

/** The server decides every amount; the client only ever sends a plan, an interval and an optional coupon code. */
export async function buildQuote(t: Pick<Tenant, "id" | "currency">, input: { planKey: string; interval: BillingInterval; currency?: string; couponCode?: string | null }): Promise<Quote> {
  const plans = await listPlans();
  const plan = plans.find((p) => p.key === input.planKey && p.isVisible);
  if (!plan) throw new AppError("That plan is not available.");
  const currency = input.currency ?? t.currency;
  const price = priceOf(plan, currency, input.interval);
  if (!price) throw new AppError(`The ${plan.name} plan has no ${input.interval === "YEAR" ? "yearly" : "monthly"} price in ${currency}.`);
  const firstPayment = !(await hasPaidBefore(t.id));
  const setupFee = firstPayment ? price.setupFee : 0;
  let discount = 0;
  let coupon: string | null = null;
  let couponMessage: string | null = null;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const c = await platformDb().coupon.findUnique({ where: { code } });
    const problem = couponProblem(c, { planKey: plan.key, interval: input.interval, currency, firstPayment });
    if (problem) couponMessage = problem;
    else if (c) {
      coupon = c.code;
      const gross = price.amount + setupFee;
      discount = Math.min(gross, c.percentOff ? Math.round((gross * c.percentOff) / 100) : (c.amountOff ?? 0));
      couponMessage = `Coupon ${c.code} applied: −${discount.toLocaleString("en-US")} ${currency}.`;
    }
  }
  return { planKey: plan.key, planName: plan.name, interval: input.interval, currency, base: price.amount, setupFee, discount, total: price.amount + setupFee - discount, coupon, couponMessage };
}

/**
 * Turns a verified payment into an active subscription period and a paid invoice. Renewing before the period ends
 * extends from the current end date, so no paid days are lost.
 */
export async function activatePlan(tenantId: string, q: Pick<Quote, "planKey" | "interval" | "currency" | "total" | "setupFee" | "coupon" | "base">, opts: { method: PaymentMethod; reference?: string | null; who: Who; periodEnd?: Date; stripe?: { customerId?: string | null; subscriptionId?: string | null } }): Promise<Invoice> {
  const db = platformDb();
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const now = new Date();
  const extending = t.subStatus === "ACTIVE" && t.planKey === q.planKey && t.currentPeriodEnd && t.currentPeriodEnd > now;
  const start = extending ? t.currentPeriodEnd! : now;
  const end = opts.periodEnd ?? addInterval(start, q.interval);
  const invoice = await db.invoice.create({
    data: { tenantId, planKey: q.planKey, interval: q.interval, amount: q.total, setupFee: q.setupFee, currency: q.currency, status: "PAID", method: opts.method, reference: opts.reference ?? null, couponCode: q.coupon, periodStart: start, periodEnd: end, paidAt: now },
  });
  await changeSubscription(
    tenantId,
    {
      subStatus: "ACTIVE", planKey: q.planKey, interval: q.interval, priceAmount: q.base, priceCurrency: q.currency, currentPeriodStart: extending ? t.currentPeriodStart : start, currentPeriodEnd: end,
      graceUntil: null, cancelAtPeriodEnd: false, couponCode: q.coupon,
      ...(opts.stripe?.customerId ? { stripeCustomerId: opts.stripe.customerId } : {}), ...(opts.stripe?.subscriptionId ? { stripeSubscriptionId: opts.stripe.subscriptionId } : {}),
    },
    opts.who,
  );
  if (q.coupon) await db.coupon.update({ where: { code: q.coupon }, data: { uses: { increment: 1 } } }).catch(() => {});
  if (t.ownerEmail) {
    const mail = renderMail({
      heading: "Payment received — thank you",
      paragraphs: [`We received ${q.total.toLocaleString("en-US")} ${q.currency} for the ${q.planKey} plan (${q.interval === "YEAR" ? "yearly" : "monthly"}).`, `Your plan is active until ${end.toISOString().slice(0, 10)}. Invoice INV-${String(invoice.number).padStart(5, "0")} is available under Plan & billing.`],
      cta: { label: "Open Plan & billing", url: workspaceUrl(t.slug, "/crm/billing") },
    });
    await sendSystemMail({ to: t.ownerEmail, subject: `Payment received — invoice INV-${String(invoice.number).padStart(5, "0")}`, text: mail.text, html: mail.html });
  }
  return invoice;
}

// ───────────── bank / wallet transfers (operator confirms the money arrived)

export async function submitLocalPayment(tenant: Tenant, input: { method: PaymentMethod; reference: string; planKey: string; interval: BillingInterval; couponCode?: string | null; note?: string | null }): Promise<Payment> {
  if (!LOCAL_METHODS.includes(input.method)) throw new AppError("Choose a bank or wallet method.");
  const reference = input.reference.trim();
  if (reference.length < 4 || reference.length > 80) throw new AppError("Enter the transaction ID or reference from your payment receipt.", "VALIDATION", { reference: "Enter the transaction reference." });
  if (await platformDb().payment.findFirst({ where: { tenantId: tenant.id, status: "PENDING" } })) throw new AppError("You already have a payment waiting to be confirmed. Please wait for it to be reviewed.", "CONFLICT");
  if (await platformDb().payment.findUnique({ where: { method_reference: { method: input.method, reference } } })) throw new AppError("That transaction reference has already been used.", "CONFLICT", { reference: "Already used." });
  const q = await buildQuote(tenant, { planKey: input.planKey, interval: input.interval, couponCode: input.couponCode });
  try {
    const p = await platformDb().payment.create({
      data: { tenantId: tenant.id, method: input.method, reference, amount: q.total, currency: q.currency, planKey: q.planKey, interval: q.interval, couponCode: q.coupon, note: input.note?.trim().slice(0, 500) || null },
    });
    const settings = await getPlatformSettings();
    if (settings.billing.operatorEmail) {
      const mail = renderMail({ heading: "A payment needs confirming", paragraphs: [`${tenant.name} (${tenant.slug}) says they paid ${q.total.toLocaleString("en-US")} ${q.currency} by ${METHOD_LABEL[input.method]}.`, `Reference: ${reference}`, "Check your account, then confirm or reject it in the platform console."], cta: { label: "Open the console", url: `${process.env.APP_URL ?? ""}/platform/payments` } });
      await sendSystemMail({ to: settings.billing.operatorEmail, subject: `Payment to confirm: ${tenant.slug}`, text: mail.text, html: mail.html });
    }
    return p;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("That transaction reference has already been used.", "CONFLICT", { reference: "Already used." });
    throw e;
  }
}

export async function confirmPayment(paymentId: string, who: Who): Promise<Invoice> {
  const db = platformDb();
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.status !== "PENDING") throw new AppError("This payment has already been decided.", "CONFLICT");
  const t = await db.tenant.findUniqueOrThrow({ where: { id: p.tenantId } });
  // Re-quote with the same coupon so the invoice always matches what the server would charge now for the same choice.
  const q = await buildQuote(t, { planKey: p.planKey, interval: p.interval, currency: p.currency, couponCode: p.couponCode });
  const invoice = await activatePlan(p.tenantId, { ...q, total: p.amount }, { method: p.method, reference: p.reference, who });
  await db.payment.update({ where: { id: p.id }, data: { status: "CONFIRMED", decidedAt: new Date(), decidedBy: who.actor ?? null, invoiceId: invoice.id } });
  return invoice;
}

export async function rejectPayment(paymentId: string, reason: string, who: Who): Promise<void> {
  const db = platformDb();
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { tenant: true } });
  if (p.status !== "PENDING") throw new AppError("This payment has already been decided.", "CONFLICT");
  if (reason.trim().length < 3) throw new AppError("Give a reason so the customer knows what to fix.");
  await db.payment.update({ where: { id: p.id }, data: { status: "REJECTED", decidedAt: new Date(), decidedBy: who.actor ?? null, rejectReason: reason.trim() } });
  if (p.tenant.ownerEmail) {
    const mail = renderMail({ heading: "We could not confirm your payment", paragraphs: [`Reference ${p.reference} was not confirmed: ${reason.trim()}`, "You can submit the payment details again from Plan & billing."], cta: { label: "Open Plan & billing", url: workspaceUrl(p.tenant.slug, "/crm/billing") } });
    await sendSystemMail({ to: p.tenant.ownerEmail, subject: "Payment not confirmed", text: mail.text, html: mail.html });
  }
}

// ───────────── refunds (separate records; the invoice stays as collected)

export async function recordRefund(invoiceId: string, input: { amount: number; reason: string; method?: string; reference?: string }, who: Who) {
  const db = platformDb();
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { refunds: true } });
  const refunded = inv.refunds.reduce((a, r) => a + r.amount, 0);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError("Enter a refund amount above zero.");
  if (input.amount > inv.amount - refunded) throw new AppError(`At most ${(inv.amount - refunded).toLocaleString("en-US")} ${inv.currency} can still be refunded on this invoice.`);
  if (input.reason.trim().length < 3) throw new AppError("A reason is required for every refund.");
  return db.refund.create({ data: { invoiceId, amount: input.amount, currency: inv.currency, reason: input.reason.trim(), method: input.method ?? null, reference: input.reference ?? null, actor: who.actor ?? null } });
}

/** Cancel at the end of the paid period (access continues until then). */
export async function cancelAtPeriodEnd(tenantId: string, who: Who) {
  const t = await platformDb().tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (t.subStatus !== "ACTIVE") throw new AppError("Only an active subscription can be cancelled.");
  return changeSubscription(tenantId, { subStatus: "CANCELED", cancelAtPeriodEnd: true }, who);
}

export const invoiceNumber = (n: number) => `INV-${String(n).padStart(5, "0")}`;
