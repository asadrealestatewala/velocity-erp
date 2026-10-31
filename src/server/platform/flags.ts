import "server-only";
import { createHash } from "node:crypto";
import type { FeatureFlag, Tenant } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { platformDb } from "./client";
import { currentTenant } from "./runtime";

export const FLAG_KEY_RE = /^[a-z][a-z0-9-]{2,39}$/;

type FlagRow = Pick<FeatureFlag, "key" | "enabled" | "planKeys" | "rolloutPercent" | "isArchived">;
type Subject = Pick<Tenant, "id" | "planKey">;

/** Stable 0–99 bucket for a workspace and flag, so a percentage rollout never flips back and forth. */
export function bucket(tenantId: string, flagKey: string): number {
  return createHash("sha256").update(`${flagKey}:${tenantId}`).digest().readUInt32BE(0) % 100;
}

export type Decision = { on: boolean; why: "override" | "plan" | "rollout" | "default" | "off" | "archived" };

/** Pure decision for one flag and workspace. Order: override, plan list, rollout percentage, global switch. */
export function decide(flag: FlagRow, t: Subject, override?: boolean | null): Decision {
  if (flag.isArchived) return { on: false, why: "archived" };
  if (override !== undefined && override !== null) return { on: override, why: "override" };
  const plans = Array.isArray(flag.planKeys) ? (flag.planKeys as string[]) : [];
  if (t.planKey && plans.includes(t.planKey)) return { on: true, why: "plan" };
  if (flag.rolloutPercent > 0 && bucket(t.id, flag.key) < flag.rolloutPercent) return { on: true, why: "rollout" };
  return flag.enabled ? { on: true, why: "default" } : { on: false, why: "off" };
}

type Snapshot = { at: number; flags: FlagRow[]; overrides: { tenantId: string; flagKey: string; enabled: boolean }[] };
let snap: Snapshot | null = null;
export const clearFlagCache = () => { snap = null; };

async function snapshot(): Promise<Snapshot> {
  if (snap && Date.now() - snap.at < 15_000) return snap;
  const [flags, overrides] = await Promise.all([platformDb().featureFlag.findMany(), platformDb().tenantFlagOverride.findMany({ select: { tenantId: true, flagKey: true, enabled: true } })]);
  return (snap = { at: Date.now(), flags, overrides });
}

/** Every flag's decision for a workspace (for the console and for passing to the UI). */
export async function flagsFor(t: Subject): Promise<Record<string, Decision>> {
  const s = await snapshot();
  const out: Record<string, Decision> = {};
  for (const f of s.flags) out[f.key] = decide(f, t, s.overrides.find((o) => o.tenantId === t.id && o.flagKey === f.key)?.enabled);
  return out;
}

/** Is `key` on for this workspace (default: the current request's)? Unknown flags are off. Fails closed on a platform outage. */
export async function isFeatureOn(key: string, t?: Subject): Promise<boolean> {
  try {
    const subject = t ?? (await currentTenant());
    const s = await snapshot();
    const f = s.flags.find((x) => x.key === key);
    return f ? decide(f, subject, s.overrides.find((o) => o.tenantId === subject.id && o.flagKey === key)?.enabled).on : false;
  } catch {
    return false;
  }
}

/** Throws a clear error unless the flag is on, for server actions and routes behind a beta feature. */
export async function assertFeature(key: string, label = "This feature"): Promise<void> {
  if (!(await isFeatureOn(key))) throw new AppError(`${label} isn't available for your workspace yet.`, "FORBIDDEN");
}
