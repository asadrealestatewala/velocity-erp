import "server-only";
import type { BillingInterval, Prisma, Tenant } from "@/generated/platform";
import { platformDb } from "./client";
import { invalidateTenant } from "./tenants";

export type Source = "ADMIN" | "PAYMENT" | "WEBHOOK" | "SYSTEM" | "SIGNUP";
export type Who = { source: Source; actor?: string | null; reason?: string | null };

const DAY = 86_400_000;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export function addInterval(from: Date, interval: BillingInterval) {
  const d = new Date(from);
  if (interval === "YEAR") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * The ONLY place a subscription state changes. Writes the workspace row and an append-only history entry together,
 * so every transition (who, why, from → to) can be reconstructed.
 */
export async function changeSubscription(tenantId: string, patch: Prisma.TenantUpdateInput, who: Who): Promise<Tenant> {
  const db = platformDb();
  const before = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const after = await db.tenant.update({ where: { id: tenantId }, data: patch });
  await db.subscriptionHistory.create({
    data: {
      tenantId,
      fromStatus: before.subStatus,
      toStatus: after.subStatus,
      planKey: after.planKey,
      source: who.source,
      actor: who.actor ?? null,
      reason: who.reason ?? null,
    },
  });
  invalidateTenant(after.slug);
  return after;
}

/** Starts (or restarts) a trial on a plan for `days` days from now (UTC). */
export function trialPatch(planKey: string, days: number, now = new Date()): Prisma.TenantUpdateInput {
  return { subStatus: "TRIALING", planKey, trialStartedAt: now, trialEndsAt: addDays(now, days), currentPeriodStart: null, currentPeriodEnd: null, graceUntil: null };
}
