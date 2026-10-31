"use server";
import { randomBytes, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { clientIp } from "@/server/request";
import { hashIdentifier } from "@/server/rate-limit";
import { newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { passwordSchema } from "@/lib/password-policy";
import { revokeSession, revokeSessions } from "@/server/platform/sessions";
import { checkSecondFactor, currentSessionId, endAdminSession, ensureFirstAdmin, getAdmin, platformAudit, requireAdminAction, startAdminSession, twoFactorRequired } from "@/server/platform/admin-auth";
import { activatePlan, buildQuote, confirmPayment, recordRefund, rejectPayment } from "@/server/platform/billing";
import { platformDb } from "@/server/platform/client";
import { decryptSecret, encryptSecret, sha256 } from "@/server/platform/crypto";
import { platformRateLimit } from "@/server/platform/guard";
import { runLifecycle } from "@/server/platform/lifecycle";
import { deletionBlocker } from "@/server/platform/purge";
import { recordManualBackup } from "@/server/platform/backups";
import { clearAnnouncementCache } from "@/server/platform/announcements";
import { sendPlanEmail } from "@/server/platform/plan-mail";
import { migrateAllTenants } from "@/server/platform/migrate-all";
import { clearEntitlementCache } from "@/server/platform/plans";
import { getPlatformSettings, savePlatformSettings } from "@/server/platform/settings";
import { addDays, addInterval, changeSubscription, trialPatch } from "@/server/platform/subscriptions";
import { invalidateTenant } from "@/server/platform/tenants";
import { webhookUrl } from "@/server/platform/stripe";

const reasonSchema = z.string().trim().min(3, "A reason is required").max(300);
const tempPassword = () => `Yd-${randomBytes(6).toString("base64url")}-${randomInt(10, 99)}`;
const refreshTenant = (slug: string) => { invalidateTenant(slug); clearEntitlementCache(); };

// ───────────────────────── sign-in / out

export type PlatformLoginState = { error?: string; needsCode?: boolean } | undefined;

export async function platformLoginAction(_: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`pf:ip:${ip}`, 20, 900)) || !(await platformRateLimit(`pf:user:${hashIdentifier(email)}`, 8, 900))) return { error: "Too many sign-in attempts. Please wait 15 minutes." };
  await ensureFirstAdmin();
  const admin = await platformDb().platformAdmin.findUnique({ where: { email } });
  const ok = admin ? await bcrypt.compare(password, admin.passwordHash) : await bcrypt.compare(password, "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.ZpQb6Y5fmmS0cVnS3SrcX1Jb7dZ2");
  if (!admin || !ok || !admin.isActive) {
    await platformAudit({ admin: admin ? { id: admin.id, email: admin.email } : { id: "", email }, action: "platform.login_failed", detail: { reason: "bad credentials" } }).catch(() => {});
    return { error: "Invalid email or password." };
  }
  if (admin.totpEnabled) {
    if (!code.trim()) return { needsCode: true };
    if (!(await checkSecondFactor(admin, code))) {
      await platformAudit({ admin, action: "platform.login_failed", detail: { reason: "bad second factor" } });
      return { needsCode: true, error: "That code is not valid. Enter the current 6-digit code or a recovery code." };
    }
  }
  await startAdminSession(admin.id);
  await platformDb().platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await platformAudit({ admin, action: "platform.login" });
  redirect("/platform");
}

export async function platformLogoutAction() {
  const a = await getAdmin();
  await endAdminSession();
  if (a) await platformAudit({ admin: a, action: "platform.logout" });
  redirect("/platform/login");
}

// ───────────────────────── workspaces

export async function setWorkspaceStatusAction(id: string, input: { status: "ACTIVE" | "SUSPENDED" | "CANCELLED"; reason: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("tenants.manage");
    const why = reasonSchema.parse(input.reason);
    const status = z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]).parse(input.status);
    const t = await platformDb().tenant.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? { deletionRequestedAt: null, deletionScheduledFor: null, deletionReason: null } : {}) } });
    refreshTenant(t.slug);
    await platformAudit({ admin: a, action: `tenant.${status.toLowerCase()}`, targetType: "Tenant", targetId: id, reason: why, detail: { slug: t.slug } });
    return { ok: true as const, message: `Workspace ${t.slug} is now ${status.toLowerCase()}.` };
  });
}

/** Schedules erasure of a suspended or cancelled workspace after the retention window. Owner-only; the operator must type the workspace code. */
export async function scheduleDeletionAction(id: string, input: { confirmSlug: string; reason: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("tenants.delete");
    const why = reasonSchema.parse(input.reason);
    const t = await platformDb().tenant.findUnique({ where: { id } });
    if (!t) throw new AppError("Workspace not found.", "NOT_FOUND");
    const blocker = deletionBlocker(t);
    if (blocker) throw new AppError(blocker);
    if (String(input.confirmSlug ?? "").trim().toLowerCase() !== t.slug) throw new AppError(`Type the workspace code (${t.slug}) to confirm.`, "VALIDATION", { confirmSlug: "Does not match" });
    const days = (await getPlatformSettings()).deletionRetentionDays;
    const at = new Date(Date.now() + days * 86_400_000);
    await platformDb().tenant.update({ where: { id }, data: { deletionRequestedAt: new Date(), deletionScheduledFor: at, deletionReason: why } });
    await platformAudit({ admin: a, action: "tenant.deletion_scheduled", targetType: "Tenant", targetId: id, reason: why, detail: { slug: t.slug, eraseAfter: at.toISOString(), retentionDays: days } });
    return { ok: true as const, message: `Scheduled. All data of ${t.slug} will be erased after ${at.toISOString().slice(0, 10)} unless you cancel. Download an export first if the customer wants one.` };
  });
}

export async function cancelDeletionAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("tenants.delete");
    const t = await platformDb().tenant.findUnique({ where: { id } });
    if (!t?.deletionScheduledFor || t.dataPurgedAt) throw new AppError("No deletion is scheduled for this workspace.");
    await platformDb().tenant.update({ where: { id }, data: { deletionRequestedAt: null, deletionScheduledFor: null, deletionReason: null } });
    await platformAudit({ admin: a, action: "tenant.deletion_cancelled", targetType: "Tenant", targetId: id, detail: { slug: t.slug } });
    return { ok: true as const, message: "Deletion cancelled. The data is kept." };
  });
}

const planChange = z.object({ planKey: z.string().min(1), interval: z.enum(["MONTH", "YEAR"]), reason: reasonSchema });

/** Authorised manual activation (e.g. an exception or a complimentary plan). No invoice — no money moved. */
export async function changePlanAction(id: string, input: z.input<typeof planChange>) {
  return runAction(async () => {
    const a = await requireAdminAction("payments.manage");
    const v = planChange.parse(input);
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id } });
    const q = await buildQuote(t, { planKey: v.planKey, interval: v.interval });
    const now = new Date();
    await changeSubscription(id, { subStatus: "ACTIVE", planKey: v.planKey, interval: v.interval, priceAmount: q.base, priceCurrency: q.currency, currentPeriodStart: now, currentPeriodEnd: addInterval(now, v.interval), graceUntil: null, cancelAtPeriodEnd: false }, { source: "ADMIN", actor: a.email, reason: v.reason });
    refreshTenant(t.slug);
    await sendPlanEmail(id, "plan-updated", { note: `your ${v.planKey} plan is now active` });
    await platformAudit({ admin: a, action: "tenant.plan_changed", targetType: "Tenant", targetId: id, reason: v.reason, detail: { plan: v.planKey, interval: v.interval } });
    return { ok: true as const, message: "Plan activated." };
  });
}

const manualPay = z.object({ planKey: z.string().min(1), interval: z.enum(["MONTH", "YEAR"]), amount: z.number().int().min(0), method: z.enum(["BANK_TRANSFER", "RAAST", "EASYPAISA", "JAZZCASH", "SADAPAY", "NAYAPAY", "MANUAL"]), reference: z.string().trim().max(80).optional(), reason: reasonSchema });

/** Money already received outside the app: creates the paid invoice and activates the plan. */
export async function recordPaymentAction(id: string, input: z.input<typeof manualPay>) {
  return runAction(async () => {
    const a = await requireAdminAction("payments.manage");
    const v = manualPay.parse(input);
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id } });
    const q = await buildQuote(t, { planKey: v.planKey, interval: v.interval });
    const inv = await activatePlan(id, { ...q, total: v.amount, coupon: null }, { method: v.method, reference: v.reference ?? null, who: { source: "ADMIN", actor: a.email, reason: v.reason } });
    refreshTenant(t.slug);
    await platformAudit({ admin: a, action: "payment.recorded", targetType: "Invoice", targetId: inv.id, reason: v.reason, detail: { tenant: t.slug, amount: v.amount, method: v.method } });
    return { ok: true as const, message: `Recorded. Invoice ${inv.number} issued.` };
  });
}

const trialSchema = z.object({ kind: z.enum(["extend", "shorten", "end", "revoke", "grant"]), days: z.number().int().min(1).max(365).optional(), reason: reasonSchema });

export async function trialAction(id: string, input: z.input<typeof trialSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("trials.manage");
    const v = trialSchema.parse(input);
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id } });
    const who = { source: "ADMIN" as const, actor: a.email, reason: `Trial ${v.kind}: ${v.reason}` };
    const now = new Date();
    if (v.kind === "extend" || v.kind === "shorten") {
      if (t.subStatus !== "TRIALING" || !t.trialEndsAt) throw new AppError("This workspace is not on a trial.");
      if (!v.days) throw new AppError("Enter a number of days.");
      const end = addDays(t.trialEndsAt, v.kind === "extend" ? v.days : -v.days);
      await changeSubscription(id, { trialEndsAt: end }, who);
    } else if (v.kind === "end") {
      if (t.subStatus !== "TRIALING") throw new AppError("This workspace is not on a trial.");
      await changeSubscription(id, { subStatus: "EXPIRED", trialEndsAt: now }, who);
    } else if (v.kind === "revoke") {
      await changeSubscription(id, { subStatus: "EXPIRED", trialEndsAt: now }, who);
      if (t.ownerEmailHash) await platformDb().trialClaim.upsert({ where: { ownerEmailHash: t.ownerEmailHash }, create: { ownerEmailHash: t.ownerEmailHash, tenantId: id }, update: {} });
    } else {
      const settings = await getPlatformSettings();
      await changeSubscription(id, trialPatch(t.planKey ?? settings.trialPlanKey, v.days ?? settings.trialDays), who);
    }
    refreshTenant(t.slug);
    if (v.kind !== "revoke") await sendPlanEmail(id, "plan-updated", { note: v.kind === "extend" ? `your free trial was extended by ${v.days} day(s)` : v.kind === "shorten" ? `your free trial was shortened by ${v.days} day(s)` : v.kind === "end" ? "your free trial has ended" : "a new free trial was started for you" });
    await platformAudit({ admin: a, action: `trial.${v.kind}`, targetType: "Tenant", targetId: id, reason: v.reason, detail: { days: v.days ?? null } });
    return { ok: true as const, message: "Trial updated." };
  });
}

export async function saveNotesAction(id: string, input: { notes: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("tenants.manage");
    await platformDb().tenant.update({ where: { id }, data: { notes: String(input.notes ?? "").slice(0, 4000) } });
    await platformAudit({ admin: a, action: "tenant.notes_saved", targetType: "Tenant", targetId: id });
    return { ok: true as const, message: "Notes saved." };
  });
}

// ───────────────────────── payments, refunds

export async function confirmPaymentAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("payments.manage");
    const inv = await confirmPayment(id, { source: "PAYMENT", actor: a.email, reason: "Bank/wallet payment confirmed" });
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id: inv.tenantId } });
    refreshTenant(t.slug);
    await platformAudit({ admin: a, action: "payment.confirmed", targetType: "Payment", targetId: id, detail: { invoice: inv.number, tenant: t.slug } });
    return { ok: true as const, message: `Confirmed. Plan active; invoice ${inv.number} issued.` };
  });
}

export async function rejectPaymentAction(id: string, input: { reason: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("payments.manage");
    const reason = reasonSchema.parse(input.reason);
    await rejectPayment(id, reason, { source: "PAYMENT", actor: a.email, reason });
    await platformAudit({ admin: a, action: "payment.rejected", targetType: "Payment", targetId: id, reason });
    return { ok: true as const, message: "Rejected. The customer has been emailed the reason." };
  });
}

const refundSchema = z.object({ amount: z.number().int().positive(), reason: reasonSchema, method: z.string().trim().max(40).optional(), reference: z.string().trim().max(80).optional() });
export async function refundAction(invoiceId: string, input: z.input<typeof refundSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("refunds.manage");
    const v = refundSchema.parse(input);
    await recordRefund(invoiceId, v, { source: "ADMIN", actor: a.email, reason: v.reason });
    await platformAudit({ admin: a, action: "refund.recorded", targetType: "Invoice", targetId: invoiceId, reason: v.reason, detail: { amount: v.amount } });
    return { ok: true as const, message: "Refund recorded." };
  });
}

// ───────────────────────── plans, prices, coupons, add-ons

const planSchema = z.object({
  name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).optional().nullable(),
  maxUsers: z.number().int().min(1), maxDealerships: z.number().int().min(0), maxContacts: z.number().int().min(0), maxStorageMb: z.number().int().min(0),
  apiAccess: z.boolean(), procurement: z.boolean(), assistant: z.boolean(), isVisible: z.boolean(), isRecommended: z.boolean(), trialEligible: z.boolean(),
  graceDays: z.number().int().min(0).max(60), features: z.array(z.string().trim().min(1).max(120)).max(12),
});
const lines = (x: unknown) => (typeof x === "string" ? x.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : x);
export async function savePlanAction(id: string, input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("plans.manage");
    const v = planSchema.parse({ ...input, features: lines(input.features) });
    const p = await platformDb().plan.update({ where: { id }, data: { ...v, description: v.description ?? null, features: v.features } });
    clearEntitlementCache();
    await platformAudit({ admin: a, action: "plan.saved", targetType: "Plan", targetId: id, detail: { key: p.key } });
    return { ok: true as const, message: "Plan saved. Limit changes apply immediately." };
  });
}

const priceSchema = z.object({ currency: z.enum(["PKR", "USD"]), interval: z.enum(["MONTH", "YEAR"]), amount: z.number().int().min(0), setupFee: z.number().int().min(0).default(0) });
/** Versioned: the old price stays in history (deactivated); existing invoices keep what they charged. */
export async function savePriceAction(planId: string, input: z.input<typeof priceSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("plans.manage");
    const v = priceSchema.parse(input);
    const db = platformDb();
    await db.$transaction([
      db.planPrice.updateMany({ where: { planId, currency: v.currency, interval: v.interval, isActive: true }, data: { isActive: false } }),
      db.planPrice.create({ data: { planId, ...v } }),
    ]);
    await platformAudit({ admin: a, action: "plan.price_changed", targetType: "Plan", targetId: planId, detail: v });
    return { ok: true as const, message: "New price saved (applies to new purchases and renewals)." };
  });
}

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "3–30 letters, numbers, - or _"),
  percentOff: z.number().int().min(1).max(100).optional().nullable(), amountOff: z.number().int().min(1).optional().nullable(), currency: z.enum(["PKR", "USD"]).optional().nullable(),
  planKey: z.string().optional().nullable(), interval: z.enum(["MONTH", "YEAR"]).optional().nullable(), maxUses: z.number().int().min(1).optional().nullable(),
  validTo: z.string().optional().nullable(), firstPaymentOnly: z.boolean().default(true),
});
export async function saveCouponAction(input: z.input<typeof couponSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("coupons.manage");
    const v = couponSchema.parse(input);
    if (!v.percentOff && !v.amountOff) throw new AppError("Choose a percent or a fixed amount.");
    if (v.percentOff && v.amountOff) throw new AppError("Choose either a percent or a fixed amount, not both.");
    if (v.amountOff && !v.currency) throw new AppError("A fixed-amount coupon needs a currency.");
    const data = { percentOff: v.percentOff ?? null, amountOff: v.amountOff ?? null, currency: v.currency ?? null, planKey: v.planKey || null, interval: v.interval ?? null, maxUses: v.maxUses ?? null, validTo: v.validTo ? new Date(v.validTo) : null, firstPaymentOnly: v.firstPaymentOnly };
    await platformDb().coupon.upsert({ where: { code: v.code }, create: { code: v.code, ...data }, update: data });
    await platformAudit({ admin: a, action: "coupon.saved", targetType: "Coupon", targetId: v.code });
    return { ok: true as const, message: `Coupon ${v.code} saved.` };
  });
}
export async function toggleCouponAction(id: string, active: boolean) {
  return runAction(async () => {
    const a = await requireAdminAction("coupons.manage");
    await platformDb().coupon.update({ where: { id }, data: { isActive: active } });
    await platformAudit({ admin: a, action: active ? "coupon.enabled" : "coupon.disabled", targetType: "Coupon", targetId: id });
    return { ok: true as const };
  });
}

const addOnSchema = z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,30}$/), name: z.string().trim().min(2).max(60), extraUsers: z.number().int().min(0).default(0), extraDealerships: z.number().int().min(0).default(0), extraContacts: z.number().int().min(0).default(0), extraStorageMb: z.number().int().min(0).default(0), giveApiAccess: z.boolean().default(false), priceMonthPkr: z.number().int().min(0).default(0), priceMonthUsd: z.number().int().min(0).default(0) });
export async function saveAddOnAction(input: z.input<typeof addOnSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("plans.manage");
    const v = addOnSchema.parse(input);
    await platformDb().addOn.upsert({ where: { key: v.key }, create: v, update: v });
    clearEntitlementCache();
    await platformAudit({ admin: a, action: "addon.saved", targetType: "AddOn", targetId: v.key });
    return { ok: true as const, message: "Add-on saved." };
  });
}
export async function grantAddOnAction(tenantId: string, input: { addOnKey: string; quantity: number; reason: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("payments.manage");
    const { addOnKey, quantity } = input;
    const why = reasonSchema.parse(input.reason);
    const addOn = await platformDb().addOn.findUniqueOrThrow({ where: { key: addOnKey } });
    const q = Math.max(0, Math.floor(quantity));
    if (q === 0) await platformDb().tenantAddOn.deleteMany({ where: { tenantId, addOnId: addOn.id } });
    else await platformDb().tenantAddOn.upsert({ where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } }, create: { tenantId, addOnId: addOn.id, quantity: q, grantedBy: a.email, reason: why }, update: { quantity: q, grantedBy: a.email, reason: why } });
    clearEntitlementCache();
    await platformAudit({ admin: a, action: "addon.granted", targetType: "Tenant", targetId: tenantId, reason: why, detail: { addOn: addOnKey, quantity: q } });
    return { ok: true as const, message: q ? "Add-on applied." : "Add-on removed." };
  });
}

// ───────────────────────── platform settings, Stripe, payment accounts

const settingsSchema = z.object({
  trialDays: z.number().int().min(0).max(60), trialPlanKey: z.string().min(1), graceDays: z.number().int().min(0).max(60), oneTrialPerOwner: z.boolean(),
  deletionRetentionDays: z.number().int().min(7).max(365), reminderDays: z.array(z.number().int().min(0).max(30)).max(6), supportEmail: z.string().trim().max(160), supportPhone: z.string().trim().max(40), operatorEmail: z.string().trim().max(160),
});
export async function saveSettingsAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    const days = typeof input.reminderDays === "string" ? input.reminderDays.split(",").map((x) => x.trim()).filter(Boolean).map(Number) : input.reminderDays;
    const v = settingsSchema.parse({ ...input, reminderDays: days });
    const cur = await getPlatformSettings();
    await savePlatformSettings({ trialDays: v.trialDays, trialPlanKey: v.trialPlanKey, graceDays: v.graceDays, oneTrialPerOwner: v.oneTrialPerOwner, deletionRetentionDays: v.deletionRetentionDays, reminderDays: v.reminderDays, support: { email: v.supportEmail, phone: v.supportPhone }, billing: { ...cur.billing, operatorEmail: v.operatorEmail } });
    await platformAudit({ admin: a, action: "settings.saved", detail: { trialDays: v.trialDays, graceDays: v.graceDays } });
    return { ok: true as const, message: "Settings saved." };
  });
}

export async function setStaff2faAction(input: { mode: "all" | "privileged" | "off" }) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    const { mode } = z.object({ mode: z.enum(["all", "privileged", "off"]) }).parse(input);
    // Lock-out guard: you cannot require two-factor unless you have it yourself, otherwise you would be stopped at the enrolment page by your own change.
    if (mode !== "off" && !a.totpEnabled) throw new AppError("Turn on two-factor for your own account first (My account), then require it for staff.", "VALIDATION", { mode: "Enrol your own two-factor first" });
    const cur = await getPlatformSettings();
    await savePlatformSettings({ staff2fa: mode });
    await platformAudit({ admin: a, action: "settings.staff_2fa", detail: { from: cur.staff2fa, to: mode } });
    return { ok: true as const, message: mode === "off" ? "Two-factor is no longer required for staff." : "Saved. Staff without two-factor will be asked to set it up at their next page load." };
  });
}

export async function setMaintenanceAction(input: { on: boolean; message: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("system.manage");
    const on = Boolean(input.on);
    await savePlatformSettings({ maintenance: { on, message: String(input.message ?? "").trim().slice(0, 300) || "We are doing scheduled maintenance. Please try again shortly." } });
    await platformAudit({ admin: a, action: on ? "maintenance.on" : "maintenance.off" });
    return { ok: true as const, message: on ? "Maintenance mode is ON: workspaces are read-only." : "Maintenance mode is off." };
  });
}

const stripeSchema = z.object({ secretKey: z.string().trim().max(200).optional(), webhookSecret: z.string().trim().max(200).optional(), publishableKey: z.string().trim().max(200).optional(), mode: z.enum(["test", "live"]), prices: z.record(z.string(), z.string().trim().max(80)) });
/** Keys are encrypted before storage and never shown again; leaving a key field empty keeps the stored one. */
export async function saveStripeAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    const priceMap = typeof input.prices === "string" ? Object.fromEntries(input.prices.split(/\r?\n/).map((l) => l.split("=").map((x) => x.trim())).filter((kv) => kv.length === 2 && kv[0] && kv[1])) : input.prices;
    const v = stripeSchema.parse({ ...input, prices: priceMap ?? {} });
    if (v.secretKey && !/^(sk|rk)_(test|live)_/.test(v.secretKey)) throw new AppError("That does not look like a Stripe secret key (it should start with sk_test_ or sk_live_).");
    if (v.webhookSecret && !v.webhookSecret.startsWith("whsec_")) throw new AppError("The webhook signing secret starts with whsec_.");
    const cur = await getPlatformSettings();
    await savePlatformSettings({
      billing: {
        ...cur.billing, stripeMode: v.mode, stripePublishableKey: v.publishableKey ?? cur.billing.stripePublishableKey,
        stripeSecretKeyEnc: v.secretKey ? encryptSecret(v.secretKey) : cur.billing.stripeSecretKeyEnc,
        stripeWebhookSecretEnc: v.webhookSecret ? encryptSecret(v.webhookSecret) : cur.billing.stripeWebhookSecretEnc,
        stripePrices: Object.fromEntries(Object.entries(v.prices).filter(([, id]) => id)),
      },
    });
    await platformAudit({ admin: a, action: "stripe.settings_saved", detail: { mode: v.mode, keysChanged: [v.secretKey && "secret", v.webhookSecret && "webhook"].filter(Boolean) } });
    return { ok: true as const, message: "Stripe settings saved (keys are stored encrypted)." };
  });
}

export async function testStripeAction() {
  return runAction(async () => {
    await requireAdminAction("settings.manage");
    const s = await getPlatformSettings();
    const key = s.billing.stripeSecretKeyEnc ? decryptSecret(s.billing.stripeSecretKeyEnc) : process.env.STRIPE_SECRET_KEY;
    if (!key) throw new AppError("No Stripe secret key is saved yet.");
    const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new AppError(`Stripe rejected the key (HTTP ${r.status}).`);
    return { ok: true as const, message: `Connected to Stripe (${key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test"} mode). Webhook URL: ${webhookUrl()}` };
  });
}

const accountSchema = z.object({ method: z.enum(["BANK_TRANSFER", "RAAST", "EASYPAISA", "JAZZCASH", "SADAPAY", "NAYAPAY"]), title: z.string().trim().min(2).max(60), accountName: z.string().trim().max(80).optional().nullable(), accountNo: z.string().trim().min(3).max(60), bankName: z.string().trim().max(60).optional().nullable(), instructions: z.string().trim().max(300).optional().nullable(), isActive: z.boolean().default(true) });
export async function saveAccountAction(id: string | null, input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    const v = accountSchema.parse(input);
    const data = { ...v, accountName: v.accountName ?? null, bankName: v.bankName ?? null, instructions: v.instructions ?? null };
    const row = id ? await platformDb().paymentAccount.update({ where: { id }, data }) : await platformDb().paymentAccount.create({ data });
    await platformAudit({ admin: a, action: "payment_account.saved", targetType: "PaymentAccount", targetId: row.id, detail: { method: v.method } });
    return { ok: true as const, message: "Payment account saved." };
  });
}
export async function deleteAccountAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    await platformDb().paymentAccount.delete({ where: { id } });
    await platformAudit({ admin: a, action: "payment_account.deleted", targetType: "PaymentAccount", targetId: id });
    return { ok: true as const };
  });
}

// ───────────────────────── platform staff

export async function createAdminAction(input: { email: string; name: string; role: "OWNER" | "BILLING" | "SUPPORT" | "ANALYTICS" }) {
  return runAction(async () => {
    const a = await requireAdminAction("admins.manage");
    const v = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(80), role: z.enum(["OWNER", "BILLING", "SUPPORT", "ANALYTICS"]) }).parse(input);
    if (await platformDb().platformAdmin.findUnique({ where: { email: v.email } })) throw new AppError("That email already has a platform account.", "CONFLICT");
    const pw = tempPassword();
    const row = await platformDb().platformAdmin.create({ data: { ...v, passwordHash: await bcrypt.hash(pw, 12) } });
    await platformAudit({ admin: a, action: "admin.created", targetType: "PlatformAdmin", targetId: row.id, detail: { email: v.email, role: v.role } });
    return { ok: true as const, data: { tempPassword: pw }, message: "Account created. Share the temporary password securely — it is shown only once." };
  });
}
export async function updateAdminAction(id: string, patch: { isActive?: boolean; role?: "OWNER" | "BILLING" | "SUPPORT" | "ANALYTICS"; reset2fa?: boolean }) {
  return runAction(async () => {
    const a = await requireAdminAction("admins.manage");
    if (id === a.id && (patch.isActive === false || (patch.role && patch.role !== a.role))) throw new AppError("You can't change your own role or deactivate yourself.");
    const data: Record<string, unknown> = {};
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.role) data.role = patch.role;
    if (patch.reset2fa) Object.assign(data, { totpEnabled: false, totpSecretEnc: null, recoveryCodes: [], lastTotpStep: 0 });
    if (patch.isActive === false || patch.reset2fa) await platformDb().platformSession.deleteMany({ where: { adminId: id } });
    await platformDb().platformAdmin.update({ where: { id }, data });
    await platformAudit({ admin: a, action: "admin.updated", targetType: "PlatformAdmin", targetId: id, detail: patch });
    return { ok: true as const, message: "Saved." };
  });
}

// ───────────────────────── my account: password and two-factor

export async function changeOwnPasswordAction(input: { current: string; next: string }) {
  return runAction(async () => {
    const { current, next } = input;
    const a = await requireAdminAction("dashboard", { allowUnenrolled: true });
    const row = await platformDb().platformAdmin.findUniqueOrThrow({ where: { id: a.id } });
    if (!(await bcrypt.compare(current, row.passwordHash))) throw new AppError("Your current password is not correct.", "VALIDATION", { current: "Incorrect password" });
    const pw = passwordSchema.safeParse(next);
    if (!pw.success) throw new AppError(pw.error.issues[0]!.message, "VALIDATION", { next: pw.error.issues[0]!.message });
    await platformDb().platformAdmin.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    await revokeSessions(a.id, await currentSessionId()); // a changed password signs out every other device
    await platformAudit({ admin: a, action: "admin.password_changed" });
    return { ok: true as const, message: "Password changed. Other devices were signed out." };
  });
}

export async function beginTotpAction() {
  return runAction(async () => {
    const a = await requireAdminAction("dashboard", { allowUnenrolled: true });
    if (a.totpEnabled) throw new AppError("Two-factor is already on. Turn it off first if you need to set up a new phone.");
    const secret = newTotpSecret();
    await platformDb().platformAdmin.update({ where: { id: a.id }, data: { totpSecretEnc: encryptSecret(secret), totpEnabled: false } });
    return { ok: true as const, data: { secret, url: otpauthUrl(secret, a.email, process.env.PLATFORM_NAME || "Velocity Platform") } };
  });
}

export async function confirmTotpAction(code: string) {
  return runAction(async () => {
    const a = await requireAdminAction("dashboard", { allowUnenrolled: true });
    const row = await platformDb().platformAdmin.findUniqueOrThrow({ where: { id: a.id } });
    if (!row.totpSecretEnc) throw new AppError("Start the setup first.");
    const step = verifyTotp(decryptSecret(row.totpSecretEnc), code);
    if (step === null) throw new AppError("That code is not right. Check the time on your phone and try again.");
    const codes = newRecoveryCodes();
    await platformDb().platformAdmin.update({ where: { id: a.id }, data: { totpEnabled: true, lastTotpStep: step, recoveryCodes: codes.map((c) => sha256(`recovery:${c.toLowerCase()}`)) } });
    await platformAudit({ admin: a, action: "admin.2fa_enabled" });
    return { ok: true as const, data: { recoveryCodes: codes }, message: "Two-factor sign-in is on. Save your recovery codes now — they are shown only once." };
  });
}

export async function disableTotpAction(password: string) {
  return runAction(async () => {
    const a = await requireAdminAction("dashboard");
    const row = await platformDb().platformAdmin.findUniqueOrThrow({ where: { id: a.id } });
    if (twoFactorRequired((await getPlatformSettings()).staff2fa, a.role)) throw new AppError("Your organisation requires two-factor sign-in for your role, so it can't be turned off.", "FORBIDDEN");
    if (!(await bcrypt.compare(password, row.passwordHash))) throw new AppError("Your password is not correct.");
    await platformDb().platformAdmin.update({ where: { id: a.id }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodes: [], lastTotpStep: 0 } });
    await platformAudit({ admin: a, action: "admin.2fa_disabled" });
    return { ok: true as const, message: "Two-factor sign-in is off." };
  });
}

// ───────────────────────── sessions

export async function revokeSessionAction(sessionId: string) {
  return runAction(async () => {
    const a = await requireAdminAction("dashboard");
    if (!(await revokeSession(a.id, String(sessionId)))) throw new AppError("That session has already ended.", "NOT_FOUND");
    await platformAudit({ admin: a, action: "admin.session_revoked", targetType: "PlatformSession", targetId: String(sessionId).slice(0, 12) });
    return { ok: true as const, message: "Signed out that device." };
  });
}

/** Signs out every other device; the one you are using stays signed in. */
export async function revokeOtherSessionsAction() {
  return runAction(async () => {
    const a = await requireAdminAction("dashboard");
    const n = await revokeSessions(a.id, await currentSessionId());
    await platformAudit({ admin: a, action: "admin.sessions_revoked_others", detail: { count: n } });
    return { ok: true as const, message: n ? `Signed out ${n} other ${n === 1 ? "device" : "devices"}.` : "There were no other signed-in devices." };
  });
}

/** An owner ends every session of a colleague (lost laptop, leaver, suspected compromise). Yourself: use "sign out other devices". */
export async function signOutAdminEverywhereAction(adminId: string) {
  return runAction(async () => {
    const a = await requireAdminAction("admins.manage");
    if (adminId === a.id) throw new AppError("Use “Sign out other devices” on My account for your own sessions.");
    const n = await revokeSessions(adminId);
    await platformAudit({ admin: a, action: "admin.sessions_revoked_all", targetType: "PlatformAdmin", targetId: adminId, detail: { count: n } });
    return { ok: true as const, message: `Ended ${n} ${n === 1 ? "session" : "sessions"}.` };
  });
}

// ───────────────────────── announcements

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Add a short title").max(80),
  body: z.string().trim().min(3, "Say what customers need to know").max(400),
  tone: z.enum(["info", "warn", "danger"]),
  planKey: z.string().trim().optional().nullable(),
  tenantCode: z.string().trim().toLowerCase().optional().nullable(),
  endsAt: z.string().trim().optional().nullable(),
});
export async function saveAnnouncementAction(input: z.input<typeof announcementSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("announcements.manage");
    const v = announcementSchema.parse(input);
    const tenant = v.tenantCode ? await platformDb().tenant.findUnique({ where: { slug: v.tenantCode } }) : null;
    if (v.tenantCode && !tenant) throw new AppError(`No workspace with code “${v.tenantCode}”.`, "VALIDATION", { tenantCode: "Unknown workspace" });
    const endsAt = v.endsAt ? new Date(`${v.endsAt}T23:59:59`) : null;
    if (endsAt && Number.isNaN(endsAt.getTime())) throw new AppError("That end date is not valid.", "VALIDATION", { endsAt: "Invalid date" });
    const row = await platformDb().announcement.create({ data: { title: v.title, body: v.body, tone: v.tone, planKey: v.planKey || null, tenantId: tenant?.id ?? null, endsAt, createdBy: a.email } });
    clearAnnouncementCache();
    await platformAudit({ admin: a, action: "announcement.created", targetType: "Announcement", targetId: row.id, detail: { title: v.title, tone: v.tone, planKey: v.planKey || null, workspace: tenant?.slug ?? null } });
    return { ok: true as const, message: "Published. Customers see it within a minute." };
  });
}
export async function toggleAnnouncementAction(id: string, active: boolean) {
  return runAction(async () => {
    const a = await requireAdminAction("announcements.manage");
    await platformDb().announcement.update({ where: { id }, data: { isActive: active } });
    clearAnnouncementCache();
    await platformAudit({ admin: a, action: active ? "announcement.enabled" : "announcement.disabled", targetType: "Announcement", targetId: id });
    return { ok: true as const };
  });
}
export async function deleteAnnouncementAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("announcements.manage");
    await platformDb().announcement.delete({ where: { id } });
    clearAnnouncementCache();
    await platformAudit({ admin: a, action: "announcement.deleted", targetType: "Announcement", targetId: id });
    return { ok: true as const, message: "Deleted." };
  });
}

// ───────────────────────── system

export async function runLifecycleAction() {
  return runAction(async () => {
    const a = await requireAdminAction("system.manage");
    const r = await runLifecycle();
    await platformAudit({ admin: a, action: "system.lifecycle_run", detail: r });
    return { ok: true as const, message: `Checked ${r.checked} workspaces · ${r.trialsExpired} trials ended · ${r.pastDue} past due · ${r.expired} expired · ${r.remindersSent} emails.` };
  });
}

/** For backups taken outside the script (provider snapshot, off-site copy), so the System page reflects reality. */
export async function recordBackupAction(input: { note: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("system.manage");
    const note = z.string().trim().min(3, "Say what was backed up and where").max(300).parse(input.note);
    await recordManualBackup(note, a.email);
    await platformAudit({ admin: a, action: "system.backup_recorded", detail: { note } });
    return { ok: true as const, message: "Backup recorded." };
  });
}

export async function migrateAllAction() {
  return runAction(async () => {
    const a = await requireAdminAction("system.manage");
    const r = await migrateAllTenants();
    const failed = r.filter((x) => x.error);
    await platformAudit({ admin: a, action: "system.migrate_all", detail: { workspaces: r.length, failed: failed.map((f) => f.slug) } });
    if (failed.length) throw new AppError(`${failed.length} workspace(s) failed: ${failed.map((f) => `${f.slug}: ${f.error}`).join("; ")}`);
    return { ok: true as const, message: `All ${r.length} workspaces are up to date (${r.reduce((n, x) => n + x.applied.length, 0)} migrations applied).` };
  });
}
