import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformDb, withParams } from "./client";
import { decryptSecret } from "./crypto";

/** The workspace that owns the original (pre-SaaS) data. Requests with no workspace go here. */
export const DEFAULT_SLUG = (process.env.DEFAULT_TENANT_SLUG || "yadea").toLowerCase();

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED = new Set([
  "www", "app", "api", "admin", "platform", "login", "signup", "portal", "crm", "procurement", "forms", "w", "static", "support",
  "billing", "mail", "status", "docs", "blog", "help", "demo", "test", "staging", "pricing", "legal", "privacy", "terms", "yadea", "default",
]);
export const isValidSlug = (s: string) => SLUG_RE.test(s) && !s.includes("--");
export const isReservedSlug = (s: string) => RESERVED.has(s);

type Cached = { at: number; tenant: Tenant | null };
const g = globalThis as unknown as { tenantCache?: Map<string, Cached>; platformDownUntil?: number };
const cache = (g.tenantCache ??= new Map<string, Cached>());
const TTL_MS = 30_000;

/** Read-only peek used by the write guard (never hits the database). */
export const cachedTenant = (slug: string) => cache.get(slug)?.tenant ?? null;
export function invalidateTenant(slug?: string) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

function legacyFallback(): Tenant {
  const now = new Date();
  return {
    id: "legacy", slug: DEFAULT_SLUG, name: process.env.LEGACY_TENANT_NAME || "YADEA", status: "ACTIVE", isLegacy: true, dbSchema: "public", dbUrlEnc: null,
    ownerName: null, ownerEmail: null, ownerEmailHash: null, timezone: process.env.APP_TIMEZONE || "Asia/Karachi", currency: "PKR", countryCode: "92",
    emailConfirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null, notes: null, subStatus: "ACTIVE", planKey: null, interval: "MONTH", priceAmount: 0,
    priceCurrency: "PKR", trialStartedAt: null, trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, graceUntil: null, cancelAtPeriodEnd: false,
    couponCode: null, stripeCustomerId: null, stripeSubscriptionId: null, provisionedAt: now, lastSeenAt: null, marketingOptOutAt: null, schemaVersion: 0, createdAt: now, updatedAt: now,
  };
}

/** Registers the original install as the first workspace (idempotent). Its data stays where it is (`public` schema). */
export async function ensureLegacyTenant(): Promise<Tenant> {
  return platformDb().tenant.upsert({
    where: { slug: DEFAULT_SLUG },
    create: {
      slug: DEFAULT_SLUG, name: process.env.LEGACY_TENANT_NAME || "YADEA", status: "ACTIVE", isLegacy: true, dbSchema: "public", subStatus: "ACTIVE",
      emailConfirmedAt: new Date(), provisionedAt: new Date(), timezone: process.env.APP_TIMEZONE || "Asia/Karachi",
    },
    update: {},
  });
}

/**
 * Looks a workspace up (30 s cache). If the platform database is not reachable or not migrated yet, the default
 * workspace keeps working in plain single-company mode so a rollout can never take the original install down.
 */
export async function getTenant(slug: string): Promise<Tenant | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tenant;
  if (slug === DEFAULT_SLUG && (g.platformDownUntil ?? 0) > Date.now()) return legacyFallback();
  try {
    let t = await platformDb().tenant.findUnique({ where: { slug } });
    if (!t && slug === DEFAULT_SLUG) t = await ensureLegacyTenant();
    cache.set(slug, { at: Date.now(), tenant: t });
    return t;
  } catch (e) {
    if (slug === DEFAULT_SLUG) {
      console.error("[platform] control plane unavailable — serving the default workspace in single-company mode:", (e as Error).message?.split("\n").pop());
      g.platformDownUntil = Date.now() + 10_000;
      return legacyFallback();
    }
    throw e;
  }
}

/** Connection string for a workspace: its own (decrypted) URL if set, else this server with its schema. */
export function tenantDbUrl(t: Pick<Tenant, "dbSchema" | "dbUrlEnc">): string {
  if (t.dbUrlEnc) return decryptSecret(t.dbUrlEnc);
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");
  if (t.dbSchema === "public") return base;
  // A small pool per workspace: many workspaces share one serverless instance.
  return withParams(base, { schema: t.dbSchema, connection_limit: process.env.TENANT_CONNECTION_LIMIT || "3" });
}

export async function listActiveTenants(): Promise<Tenant[]> {
  try {
    const rows = await platformDb().tenant.findMany({ where: { status: { in: ["ACTIVE"] } }, orderBy: { createdAt: "asc" } });
    if (!rows.some((r) => r.slug === DEFAULT_SLUG)) rows.unshift(await ensureLegacyTenant());
    return rows;
  } catch (e) {
    console.error("[platform] could not list workspaces — running the default only:", (e as Error).message?.split("\n").pop());
    return [legacyFallback()];
  }
}
