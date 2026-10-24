import "server-only";
import { platformDb } from "./client";
import { applyMigrations, listMigrations, pendingMigrations } from "./migrate";
import { ensureLegacyTenant, invalidateTenant } from "./tenants";
import { tenantDbUrl } from "./tenants";

export type MigrateResult = { slug: string; schema: string; applied: string[]; error?: string };

/** Brings EVERY workspace schema up to the latest CRM migration. Additive and idempotent: run it after each deploy that adds a migration. */
export async function migrateAllTenants(): Promise<MigrateResult[]> {
  await ensureLegacyTenant();
  const tenants = await platformDb().tenant.findMany({ where: { status: { in: ["ACTIVE", "SUSPENDED"] } }, orderBy: { createdAt: "asc" } });
  const out: MigrateResult[] = [];
  for (const t of tenants) {
    try {
      // Workspaces with their own connection string are migrated on that server.
      const connectionString = t.dbUrlEnc ? stripSchema(tenantDbUrl(t)) : undefined;
      const applied = await applyMigrations(t.dbSchema, { connectionString });
      await platformDb().tenant.update({ where: { id: t.id }, data: { schemaVersion: listMigrations().length } });
      out.push({ slug: t.slug, schema: t.dbSchema, applied });
    } catch (e) {
      out.push({ slug: t.slug, schema: t.dbSchema, applied: [], error: (e as Error).message });
    }
    invalidateTenant(t.slug);
  }
  return out;
}

export async function pendingByTenant(): Promise<{ slug: string; pending: string[] }[]> {
  const tenants = await platformDb().tenant.findMany({ where: { status: { in: ["ACTIVE", "SUSPENDED"] } }, orderBy: { createdAt: "asc" } });
  const rows: { slug: string; pending: string[] }[] = [];
  for (const t of tenants) rows.push({ slug: t.slug, pending: await pendingMigrations(t.dbSchema, { connectionString: t.dbUrlEnc ? stripSchema(tenantDbUrl(t)) : undefined }).catch(() => ["(unreachable)"]) });
  return rows;
}

function stripSchema(url: string) {
  const u = new URL(url);
  u.searchParams.delete("schema");
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("connection_limit");
  return u.toString();
}
