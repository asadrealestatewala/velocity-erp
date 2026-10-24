import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Applies the CRM's Prisma migrations (prisma/migrations/*) to ONE workspace schema.
 * New workspaces are created by running every migration into an empty schema; existing ones receive only what they
 * are missing. Applied names are tracked in "_tenant_migrations" inside that schema.
 */
export type MigrationFile = { name: string; sql: string };

export function listMigrations(dir = path.join(process.cwd(), "prisma", "migrations")): MigrationFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => ({ name: d.name, sql: fs.readFileSync(path.join(dir, d.name, "migration.sql"), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
export const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** A direct (non-pooled) connection is preferred for DDL; falls back to DATABASE_URL. */
export function ddlConnectionString() {
  const raw = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const u = new URL(raw);
  u.searchParams.delete("schema");
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("connection_limit");
  return u.toString();
}

export const schemaNameFor = (slug: string) => `t_${slug.replace(/-/g, "_")}`.slice(0, 63);

async function withClient<T>(connectionString: string | undefined, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: connectionString ?? ddlConnectionString(), ssl: process.env.PGSSL === "disable" ? undefined : /localhost|127\.0\.0\.1/.test(connectionString ?? ddlConnectionString()) ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => {});
  }
}

export async function createSchema(schema: string, connectionString?: string) {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Invalid schema name "${schema}"`);
  await withClient(connectionString, (c) => c.query(`CREATE SCHEMA IF NOT EXISTS ${q(schema)}`).then(() => undefined));
}

export async function dropSchema(schema: string, connectionString?: string) {
  if (!SCHEMA_RE.test(schema) || schema === "public" || schema === "platform") throw new Error(`Refusing to drop schema "${schema}"`);
  await withClient(connectionString, (c) => c.query(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`).then(() => undefined));
}

/** Applies every migration the schema has not seen. Returns the names applied. Each migration runs in its own transaction. */
export async function applyMigrations(schema: string, opts: { connectionString?: string; migrations?: MigrationFile[] } = {}): Promise<string[]> {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Invalid schema name "${schema}"`);
  const files = opts.migrations ?? listMigrations();
  return withClient(opts.connectionString, async (c) => {
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${q(schema)}`);
    await c.query(`CREATE TABLE IF NOT EXISTS ${q(schema)}."_tenant_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

    // The original install was migrated by Prisma: adopt its history so those migrations are never re-run.
    const seen = await c.query(`SELECT count(*)::int AS n FROM ${q(schema)}."_tenant_migrations"`);
    if (seen.rows[0].n === 0) {
      const prismaTable = await c.query(`SELECT to_regclass($1) AS t`, [`${q(schema)}."_prisma_migrations"`]);
      if (prismaTable.rows[0].t) {
        await c.query(
          `INSERT INTO ${q(schema)}."_tenant_migrations" (name) SELECT migration_name FROM ${q(schema)}."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ON CONFLICT DO NOTHING`,
        );
      }
    }
    const done = new Set((await c.query(`SELECT name FROM ${q(schema)}."_tenant_migrations"`)).rows.map((r) => r.name as string));
    const applied: string[] = [];
    for (const m of files) {
      if (done.has(m.name)) continue;
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL search_path TO ${q(schema)}`);
        await c.query(m.sql);
        await c.query(`INSERT INTO ${q(schema)}."_tenant_migrations" (name) VALUES ($1)`, [m.name]);
        await c.query("COMMIT");
        applied.push(m.name);
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw new Error(`Migration ${m.name} failed in schema ${schema}: ${(e as Error).message}`);
      }
    }
    return applied;
  });
}

export async function pendingMigrations(schema: string, opts: { connectionString?: string } = {}): Promise<string[]> {
  const files = listMigrations();
  return withClient(opts.connectionString, async (c) => {
    const t = await c.query(`SELECT to_regclass($1) AS t`, [`${q(schema)}."_tenant_migrations"`]);
    if (!t.rows[0].t) return files.map((f) => f.name);
    const done = new Set((await c.query(`SELECT name FROM ${q(schema)}."_tenant_migrations"`)).rows.map((r) => r.name as string));
    return files.filter((f) => !done.has(f.name)).map((f) => f.name);
  });
}
