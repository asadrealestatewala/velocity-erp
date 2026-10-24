/**
 * Backs up the control plane and every workspace to ./backups/<timestamp>/ as pg_dump custom-format files, one per schema.
 *   npm run platform:backup            (reads .env)
 *   npm run platform:backup -- --cloud (reads .env.cloud, uses MIGRATE_DATABASE_URL when set)
 * Needs the PostgreSQL client tools (pg_dump) on PATH. Restore one workspace with:
 *   pg_restore --clean --if-exists --no-owner -d "<connection string>" backups/<timestamp>/<schema>.dump
 * Workspaces with their own connection string (dbUrlEnc) are dumped from that database.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "dotenv";

const run = promisify(execFile);
const cloud = process.argv.includes("--cloud");
const file = cloud ? ".env.cloud" : ".env";
if (fs.existsSync(file)) for (const [k, v] of Object.entries(parse(fs.readFileSync(file)))) process.env[k] = v;
if (cloud && process.env.MIGRATE_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATE_DATABASE_URL;

async function dump(connection: string, schema: string, out: string) {
  const u = new URL(connection);
  for (const p of ["schema", "pgbouncer", "connection_limit"]) u.searchParams.delete(p);
  await run("pg_dump", ["--format=custom", "--no-owner", `--schema=${schema}`, `--file=${out}`, u.toString()], { maxBuffer: 1 << 26 });
  const size = fs.statSync(out).size;
  console.log(`✓ ${schema}  ${(size / 1024).toFixed(0)} KB  -> ${out}`);
}

async function main() {
  const { platformDb } = await import("../src/server/platform/client");
  const { tenantDbUrl } = await import("../src/server/platform/tenants");
  const { ddlConnectionString } = await import("../src/server/platform/migrate");
  const dir = path.join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  const base = ddlConnectionString();
  const platformSchema = new URL(process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL!).searchParams.get("schema") || "platform";
  let failed = 0;
  const attempt = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { failed++; console.error(`✗ ${label}: ${(e as Error).message.split("\n")[0]}`); }
  };
  await attempt("platform", () => dump(base, platformSchema, path.join(dir, `${platformSchema}.dump`)));
  for (const t of await platformDb().tenant.findMany({ where: { status: { not: "PROVISIONING" } } })) {
    await attempt(t.slug, () => dump(t.dbUrlEnc ? tenantDbUrl(t) : base, t.dbSchema, path.join(dir, `${t.dbSchema}.dump`)));
  }
  console.log(failed ? `Finished with ${failed} failure(s).` : `Backup complete: ${dir}`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
