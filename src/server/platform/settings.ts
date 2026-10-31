import "server-only";
import { platformDb } from "./client";

/** Platform-wide settings, edited in the platform console. Defaults apply until a value is saved. */
export type PlatformSettings = {
  trialDays: number;
  trialPlanKey: string;
  reminderDays: number[];
  graceDays: number;
  oneTrialPerOwner: boolean;
  maintenance: { on: boolean; message: string };
  support: { email: string; phone: string };
  /** Addresses or CIDR ranges allowed to use the console. Empty = anywhere. */
  staffIpAllowlist: string[];
  billing: {
    stripeMode: "test" | "live";
    stripeSecretKeyEnc: string | null;
    stripeWebhookSecretEnc: string | null;
    stripePublishableKey: string;
    /** Stripe price ids keyed `<planKey>_<MONTH|YEAR>` and `<planKey>_setup`. */
    stripePrices: Record<string, string>;
    operatorEmail: string;
  };
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  trialDays: 7,
  trialPlanKey: "growth",
  reminderDays: [3, 1, 0],
  graceDays: 7,
  oneTrialPerOwner: true,
  maintenance: { on: false, message: "We are doing scheduled maintenance. Please try again shortly." },
  support: { email: "", phone: "" },
  staffIpAllowlist: [],
  billing: { stripeMode: "test", stripeSecretKeyEnc: null, stripeWebhookSecretEnc: null, stripePublishableKey: "", stripePrices: {}, operatorEmail: "" },
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await platformDb().siteSetting.findUnique({ where: { key: "platform" } });
  const v = (row?.value ?? {}) as Partial<PlatformSettings>;
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...v,
    maintenance: { ...DEFAULT_PLATFORM_SETTINGS.maintenance, ...(v.maintenance ?? {}) },
    support: { ...DEFAULT_PLATFORM_SETTINGS.support, ...(v.support ?? {}) },
    billing: { ...DEFAULT_PLATFORM_SETTINGS.billing, ...(v.billing ?? {}) },
  };
}

let maintenanceCache: { on: boolean; at: number } | null = null;

/** Cached for 10 s so the write guard can ask on every write without a query each time. Fails open: a settings outage never blocks the CRM. */
export async function maintenanceActive(): Promise<boolean> {
  if (maintenanceCache && Date.now() - maintenanceCache.at < 10_000) return maintenanceCache.on;
  try {
    const on = (await getPlatformSettings()).maintenance.on;
    maintenanceCache = { on, at: Date.now() };
    return on;
  } catch {
    return false;
  }
}

export async function savePlatformSettings(patch: Partial<PlatformSettings>) {
  maintenanceCache = null;
  allowCache = null;
  const next = { ...(await getPlatformSettings()), ...patch };
  await platformDb().siteSetting.upsert({ where: { key: "platform" }, create: { key: "platform", value: next as object }, update: { value: next as object } });
  return next;
}

let allowCache: { list: string[]; at: number } | null = null;
export const clearAllowlistCache = () => { allowCache = null; };

/** Cached for 10 s. Fails open: a settings outage must not lock every staff member out (the break-glass env switch exists for the opposite problem). */
export async function staffAllowlist(): Promise<string[]> {
  if (allowCache && Date.now() - allowCache.at < 10_000) return allowCache.list;
  try {
    const list = (await getPlatformSettings()).staffIpAllowlist ?? [];
    allowCache = { list, at: Date.now() };
    return list;
  } catch {
    return [];
  }
}
