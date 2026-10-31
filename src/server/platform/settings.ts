import "server-only";
import { platformDb } from "./client";

export type Staff2faMode = "all" | "privileged" | "off";

/** Platform-wide settings, edited in the platform console. Defaults apply until a value is saved. */
export type PlatformSettings = {
  trialDays: number;
  trialPlanKey: string;
  reminderDays: number[];
  graceDays: number;
  oneTrialPerOwner: boolean;
  /** Who must sign in with two-factor: every staff member, only owners and billing staff, or nobody. */
  staff2fa: Staff2faMode;
  /** Days between scheduling a workspace's deletion and its data actually being erased. */
  deletionRetentionDays: number;
  maintenance: { on: boolean; message: string };
  support: { email: string; phone: string };
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
  // Off until an owner who has enrolled themselves switches it on (see setStaff2faAction), so a first deploy can never lock anyone out.
  staff2fa: "off",
  deletionRetentionDays: 30,
  maintenance: { on: false, message: "We are doing scheduled maintenance. Please try again shortly." },
  support: { email: "", phone: "" },
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
  const next = { ...(await getPlatformSettings()), ...patch };
  await platformDb().siteSetting.upsert({ where: { key: "platform" }, create: { key: "platform", value: next as object }, update: { value: next as object } });
  return next;
}
