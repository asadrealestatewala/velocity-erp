"use server";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import { AppError, runAction } from "@/server/errors";
import { audit } from "@/server/audit";
import { buildQuote, cancelAtPeriodEnd, LOCAL_METHODS, submitLocalPayment } from "@/server/platform/billing";
import { currentTenant } from "@/server/platform/runtime";
import { createCheckout, createPortal, stripeConfigured } from "@/server/platform/stripe";
import { invalidateTenant } from "@/server/platform/tenants";

const choice = z.object({ planKey: z.string().min(1), interval: z.enum(["MONTH", "YEAR"]), couponCode: z.string().trim().max(40).optional().nullable() });

/** Price preview for the chosen plan/interval/coupon. The server computes every amount. */
export async function quoteAction(input: z.input<typeof choice>) {
  return runAction(async () => {
    await requireUser("settings.manage");
    const v = choice.parse(input);
    return { ok: true as const, data: await buildQuote(await currentTenant(), v) };
  });
}

/** Card payment: returns the hosted Checkout URL for the client to open. */
export async function startCheckoutAction(input: z.input<typeof choice>) {
  return runAction(async () => {
    const me = await requireUser("settings.manage");
    const v = choice.parse(input);
    if (!(await stripeConfigured())) throw new AppError("Card payment is not set up yet. Use a bank or wallet transfer.");
    const url = await createCheckout(await currentTenant(), v);
    await audit({ userId: me.id, action: "billing.checkout_started", entityType: "Workspace", changes: { plan: v.planKey, interval: v.interval } });
    return { ok: true as const, data: { url } };
  });
}

const local = choice.extend({ method: z.enum(LOCAL_METHODS as [string, ...string[]]), reference: z.string().trim().min(4, "Enter the transaction reference").max(80), note: z.string().trim().max(500).optional() });

/** Bank/wallet transfer: records what the customer paid; a platform operator confirms the money arrived. */
export async function submitPaymentAction(input: z.input<typeof local>) {
  return runAction(async () => {
    const me = await requireUser("settings.manage");
    const v = local.parse(input);
    const p = await submitLocalPayment(await currentTenant(), { ...v, method: v.method as never });
    await audit({ userId: me.id, action: "billing.payment_submitted", entityType: "Workspace", changes: { method: v.method, plan: v.planKey, amount: p.amount } });
    return { ok: true as const, message: "Thanks! We will confirm your payment shortly and activate the plan." };
  });
}

export async function openPortalAction() {
  return runAction(async () => {
    await requireUser("settings.manage");
    return { ok: true as const, data: { url: await createPortal(await currentTenant()) } };
  });
}

export async function cancelSubscriptionAction() {
  return runAction(async () => {
    const me = await requireUser("settings.manage");
    const t = await currentTenant();
    await cancelAtPeriodEnd(t.id, { source: "ADMIN", actor: me.email, reason: "Cancelled by the workspace owner" });
    invalidateTenant(t.slug);
    await audit({ userId: me.id, action: "billing.cancelled", entityType: "Workspace" });
    return { ok: true as const, message: "Your subscription will not renew. You keep full access until the end of the paid period." };
  });
}
