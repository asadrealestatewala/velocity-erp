import "server-only";
import type { Plan, PlanPrice, Tenant } from "@yadea/platform-client";
import { platformDb } from "./client";

/**
 * Seed plans. THE PRICES AND LIMITS BELOW ARE PLACEHOLDERS — set the real ones in the platform console
 * (Plans). Price edits are versioned: new purchases and renewals use the new price, past invoices keep what was charged.
 */
export const DEFAULT_PLANS = [
  {
    key: "starter", name: "Starter", description: "For a brand with a handful of showrooms.", sortOrder: 1, isRecommended: false,
    maxUsers: 5, maxDealerships: 3, maxContacts: 2_000, maxStorageMb: 1_024, apiAccess: false, procurement: false, assistant: true,
    features: ["Central CRM and lead pipeline", "Up to 5 staff logins", "Up to 3 dealerships", "Public test-drive and inquiry forms", "Built-in assistant"],
    prices: { PKR: { MONTH: 9_900, YEAR: 99_000 }, USD: { MONTH: 39, YEAR: 390 } },
  },
  {
    key: "growth", name: "Growth", description: "For a growing dealer network.", sortOrder: 2, isRecommended: true,
    maxUsers: 20, maxDealerships: 15, maxContacts: 20_000, maxStorageMb: 10_240, apiAccess: true, procurement: true, assistant: true,
    features: ["Everything in Starter", "Up to 20 staff logins and 15 dealerships", "Dealer portal with goals, XP and leaderboard", "Procurement and dealer ledger", "Website and API access"],
    prices: { PKR: { MONTH: 29_900, YEAR: 299_000 }, USD: { MONTH: 119, YEAR: 1_190 } },
  },
  {
    key: "enterprise", name: "Enterprise", description: "For national networks with custom needs.", sortOrder: 3, isRecommended: false,
    maxUsers: 100, maxDealerships: 100, maxContacts: 250_000, maxStorageMb: 102_400, apiAccess: true, procurement: true, assistant: true,
    features: ["Everything in Growth", "Up to 100 staff logins and 100 dealerships", "Priority support", "Custom onboarding"],
    prices: { PKR: { MONTH: 79_900, YEAR: 799_000 }, USD: { MONTH: 319, YEAR: 3_190 } },
  },
] as const;

/** Creates the seed plans only when none exist yet (safe to call on every start-up). */
export async function ensureDefaultPlans() {
  const db = platformDb();
  if ((await db.plan.count()) > 0) return;
  for (const p of DEFAULT_PLANS) {
    const { prices, ...data } = p;
    const plan = await db.plan.create({ data: { ...data, features: [...data.features] as string[] } });
    for (const [currency, byInterval] of Object.entries(prices) as [string, Record<string, number>][]) {
      for (const [interval, amount] of Object.entries(byInterval)) {
        await db.planPrice.create({ data: { planId: plan.id, currency, interval: interval as "MONTH" | "YEAR", amount } });
      }
    }
  }
}

export type PlanWithPrices = Plan & { prices: PlanPrice[] };

export async function listPlans(opts: { visibleOnly?: boolean } = {}): Promise<PlanWithPrices[]> {
  await ensureDefaultPlans();
  return platformDb().plan.findMany({
    where: opts.visibleOnly ? { isVisible: true } : {},
    orderBy: { sortOrder: "asc" },
    include: { prices: { where: { isActive: true }, orderBy: { createdAt: "desc" } } },
  });
}

export function priceOf(plan: PlanWithPrices, currency: string, interval: "MONTH" | "YEAR") {
  return plan.prices.find((p) => p.currency === currency && p.interval === interval) ?? null;
}

export type Entitlements = {
  planKey: string | null;
  /** `null` = unlimited. */
  maxUsers: number | null;
  maxDealerships: number | null;
  maxContacts: number | null;
  maxStorageMb: number | null;
  apiAccess: boolean;
  procurement: boolean;
  assistant: boolean;
};

const UNLIMITED: Entitlements = { planKey: null, maxUsers: null, maxDealerships: null, maxContacts: null, maxStorageMb: null, apiAccess: true, procurement: true, assistant: true };

const entCache = new Map<string, { at: number; ent: Entitlements }>();
/** 60-second cache: entitlements are read on every request (module gating) but change rarely. */
export async function entitlementsCached(t: Pick<Tenant, "id" | "isLegacy" | "planKey">): Promise<Entitlements> {
  const key = `${t.id}|${t.planKey}`;
  const hit = entCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.ent;
  const ent = await entitlementsFor(t);
  entCache.set(key, { at: Date.now(), ent });
  return ent;
}
export const clearEntitlementCache = () => entCache.clear();

/** What this workspace may use: its plan's limits plus any add-ons. The original install is unlimited. */
export async function entitlementsFor(t: Pick<Tenant, "id" | "isLegacy" | "planKey">): Promise<Entitlements> {
  if (t.isLegacy) return { ...UNLIMITED, planKey: t.planKey };
  await ensureDefaultPlans();
  const plan = t.planKey ? await platformDb().plan.findUnique({ where: { key: t.planKey } }) : null;
  if (!plan) return { planKey: t.planKey, maxUsers: 1, maxDealerships: 0, maxContacts: 0, maxStorageMb: 0, apiAccess: false, procurement: false, assistant: false };
  const addOns = await platformDb().tenantAddOn.findMany({ where: { tenantId: t.id }, include: { addOn: true } });
  const sum = (f: (a: (typeof addOns)[number]["addOn"]) => number) => addOns.reduce((n, x) => n + f(x.addOn) * x.quantity, 0);
  return {
    planKey: plan.key,
    maxUsers: plan.maxUsers + sum((a) => a.extraUsers),
    maxDealerships: plan.maxDealerships + sum((a) => a.extraDealerships),
    maxContacts: plan.maxContacts + sum((a) => a.extraContacts),
    maxStorageMb: plan.maxStorageMb + sum((a) => a.extraStorageMb),
    apiAccess: plan.apiAccess || addOns.some((x) => x.addOn.giveApiAccess),
    procurement: plan.procurement,
    assistant: plan.assistant,
  };
}
