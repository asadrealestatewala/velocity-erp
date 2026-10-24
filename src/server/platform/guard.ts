import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/server/errors";
import { billingState } from "./billing-state";
import { entitlementsFor, type Entitlements } from "./plans";
import { currentTenant } from "./runtime";
import { platformDb } from "./client";

/** Fixed-window limiter on the platform database (signup, forgot-password, demo requests — before any workspace exists). */
export async function platformRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await platformDb().$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart") VALUES (${key}, 1, ${windowStart})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" = ${windowStart} THEN "RateLimitBucket"."count" + 1 ELSE 1 END,
      "windowStart" = ${windowStart}
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

export type Usage = { users: number; dealerships: number; contacts: number; storageMb: number };

/** What this workspace is using right now (read from its own database). */
export async function currentUsage(): Promise<Usage> {
  const [activeUsers, pendingInvites, dealerships, contacts, bytes] = await Promise.all([
    db.user.count({ where: { isActive: true } }),
    db.userInvitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.dealership.count(),
    db.contact.count({ where: { isArchived: false } }),
    db.storedFile.aggregate({ _sum: { size: true } }),
  ]);
  return { users: activeUsers + pendingInvites, dealerships, contacts, storageMb: Math.ceil(Number(bytes._sum.size ?? 0) / 1024 / 1024) };
}

const LABEL: Record<"maxUsers" | "maxDealerships" | "maxContacts" | "maxStorageMb", string> = {
  maxUsers: "staff logins",
  maxDealerships: "dealerships",
  maxContacts: "contacts",
  maxStorageMb: "MB of file storage",
};
const USAGE_KEY = { maxUsers: "users", maxDealerships: "dealerships", maxContacts: "contacts", maxStorageMb: "storageMb" } as const;

/** Throws a clear, actionable error when adding `adding` more of something would exceed the plan. No-op for unlimited plans. */
export async function assertWithinPlan(limit: keyof typeof LABEL, adding = 1): Promise<void> {
  const t = await currentTenant();
  if (t.isLegacy) return;
  const ent = await entitlementsFor(t);
  const cap = ent[limit];
  if (cap === null) return;
  const used = (await currentUsage())[USAGE_KEY[limit]];
  if (used + adding > cap) {
    throw new AppError(`Your ${ent.planKey ?? "current"} plan includes ${cap.toLocaleString("en-US")} ${LABEL[limit]} and you are using ${used.toLocaleString("en-US")}. Upgrade in Settings → Plan & billing to add more.`, "PLAN_LIMIT");
  }
}

/** Throws unless the plan includes a module ("procurement" | "apiAccess" | "assistant"). */
export async function assertModule(module: keyof Pick<Entitlements, "procurement" | "apiAccess" | "assistant">): Promise<void> {
  const t = await currentTenant();
  if (t.isLegacy) return;
  const ent = await entitlementsFor(t);
  if (!ent[module]) throw new AppError(`This feature is not included in your ${ent.planKey ?? "current"} plan. Upgrade in Settings → Plan & billing.`, "PLAN_LIMIT");
}

/** Throws when the workspace is read-only (use before work that wouldn't hit the database guard, e.g. sending messages). */
export async function assertWritable(): Promise<void> {
  const state = billingState(await currentTenant());
  if (state.locked) throw new AppError("Your workspace is read-only until billing is up to date. Open Settings → Plan & billing.", "BILLING_LOCKED");
}
