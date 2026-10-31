import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import type { Tenant } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { billingState } from "./billing-state";
import { maintenanceActive } from "./settings";
import { cachedTenant, DEFAULT_SLUG, getTenant, listActiveTenants, tenantDbUrl } from "./tenants";

export const TENANT_COOKIE = "yadea_tenant";
export const TENANT_HEADER = "x-tenant";
/** Present while a platform operator is "viewing as" a workspace user. While it is set, every database write in a request is refused. */
export const VIEW_AS_COOKIE = "yadea_viewas";

const als = new AsyncLocalStorage<{ slug: string }>();

/** Run `fn` inside a specific workspace (cron jobs, provisioning, scripts, tests). Wins over the request's workspace. */
export function runInTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ slug }, fn);
}

/** Next.js signals "this page needs a request" with special errors; those must reach the framework untouched. */
function isDynamicUsage(e: unknown) {
  const x = e as { digest?: string; message?: string } | null;
  return !!x && (x.digest === "DYNAMIC_SERVER_USAGE" || x.digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING" || /Dynamic server usage|bail out of prerendering/i.test(x.message ?? ""));
}

/** Which workspace does this request belong to? header (set by the /w/<code> rewrite) → cookie → none. */
const requestSlug = cache(async (): Promise<string | null> => {
  try {
    const h = await headers();
    const fromHeader = h.get(TENANT_HEADER)?.toLowerCase();
    if (fromHeader) return fromHeader;
    const jar = await cookies();
    return jar.get(TENANT_COOKIE)?.value?.toLowerCase() ?? null;
  } catch (e) {
    if (isDynamicUsage(e)) throw e;
    return null; // no request scope: scripts, tests, build-time work
  }
});

/** Workspace remembered for this browser (set by /w/<code> links and by a previous sign-in), if any. */
export const rememberedWorkspace = requestSlug;

/** The workspace for the current call: explicit context → request → default. Unknown request values fall back to the default workspace. */
export async function currentTenant(): Promise<Tenant> {
  const explicit = als.getStore()?.slug;
  const wanted = explicit ?? (await requestSlug()) ?? DEFAULT_SLUG;
  let t = await getTenant(wanted);
  if (!t && !explicit) t = await getTenant(DEFAULT_SLUG);
  if (!t) throw new Error(`Unknown workspace "${wanted}"`);
  return t;
}

// ── Per-workspace Prisma clients (cached, bounded)

type Entry = { client: PrismaClient; used: number };
const g = globalThis as unknown as { tenantClients?: Map<string, Entry> };
const clients = (g.tenantClients ??= new Map<string, Entry>());
const MAX_CLIENTS = Number(process.env.TENANT_CLIENT_CACHE || 12);

/** Writes allowed even when a workspace is read-only (sign-in, audit, password reset). */
const LOCKED_OK_MODELS = new Set(["Session", "AuditLog", "PasswordResetToken", "Notification"]);
const USER_SELF_FIELDS = new Set(["lastLoginAt", "passwordHash", "mustChangePassword", "totpSecretEnc", "totpEnabled", "recoveryCodes", "lastTotpStep", "updatedAt"]);
const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany"]);

export class ReadOnlyViewError extends AppError {
  constructor() {
    super("You are viewing this workspace as platform support, which is read-only. Exit the view to make changes.", "FORBIDDEN");
  }
}

/** Fails closed: a request that carries the view-as cookie cannot write, even if the cookie has just expired. Scripts and cron (explicit workspace context) are unaffected. */
async function viewingAs(): Promise<boolean> {
  if (als.getStore()) return false;
  try {
    return Boolean((await cookies()).get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (isDynamicUsage(e)) throw e;
    return false; // no request scope
  }
}

function lockedFor(slug: string) {
  const t = cachedTenant(slug);
  return t ? billingState(t).locked : false;
}

export class MaintenanceError extends AppError {
  constructor() {
    super("The system is in scheduled maintenance and is read-only for a short while. Please try again shortly.", "BILLING_LOCKED");
  }
}

export class BillingLockedError extends AppError {
  constructor() {
    super("Your workspace is read-only until billing is up to date. Open Plan & billing to fix this.", "BILLING_LOCKED");
  }
}

function build(t: Tenant): PrismaClient {
  const base = new PrismaClient({ datasourceUrl: tenantDbUrl(t), log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
  // Defence in depth: whatever code path writes, a locked workspace cannot change data.
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPS.has(operation) && (await viewingAs())) throw new ReadOnlyViewError();
          if (WRITE_OPS.has(operation) && !LOCKED_OK_MODELS.has(model)) {
            const selfOnly = model === "User" && (operation === "update" || operation === "updateMany") && Object.keys((args as { data?: object }).data ?? {}).every((k) => USER_SELF_FIELDS.has(k));
            if (!selfOnly) {
              if (await maintenanceActive()) throw new MaintenanceError();
              if (lockedFor(t.slug)) throw new BillingLockedError();
            }
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

function clientFor(t: Tenant): PrismaClient {
  const key = `${t.id}|${t.dbSchema}|${t.dbUrlEnc ?? ""}`;
  const hit = clients.get(key);
  if (hit) {
    hit.used = Date.now();
    return hit.client;
  }
  if (clients.size >= MAX_CLIENTS) {
    const [oldest] = [...clients.entries()].sort((a, b) => a[1].used - b[1].used);
    if (oldest) {
      void oldest[1].client.$disconnect().catch(() => {});
      clients.delete(oldest[0]);
    }
  }
  const client = build(t);
  clients.set(key, { client, used: Date.now() });
  return client;
}

/** Prisma client for the current workspace. */
export async function tenantClient(): Promise<PrismaClient> {
  return clientFor(await currentTenant());
}

/** Prisma client for a named workspace (provisioning, cron, console). */
export async function clientForSlug(slug: string): Promise<PrismaClient> {
  const t = await getTenant(slug);
  if (!t) throw new Error(`Unknown workspace "${slug}"`);
  return clientFor(t);
}

/** Runs `fn` once per active workspace, each inside its own context. Failures in one workspace never stop the others. */
export async function forEachTenant<T>(fn: (t: Tenant) => Promise<T>): Promise<{ slug: string; ok: boolean; result?: T; error?: string }[]> {
  const out: { slug: string; ok: boolean; result?: T; error?: string }[] = [];
  for (const t of await listActiveTenants()) {
    try {
      out.push({ slug: t.slug, ok: true, result: await runInTenant(t.slug, () => fn(t)) });
    } catch (e) {
      console.error(`[tenants] ${t.slug} failed`, e);
      out.push({ slug: t.slug, ok: false, error: (e as Error).message });
    }
  }
  return out;
}

export async function disconnectAllTenants() {
  await Promise.all([...clients.values()].map((e) => e.client.$disconnect().catch(() => {})));
  clients.clear();
}
