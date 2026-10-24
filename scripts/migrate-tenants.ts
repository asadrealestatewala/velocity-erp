/**
 * Applies pending CRM migrations to every workspace schema (including the original `public` one).
 * Run after deploying a release that adds prisma/migrations/*:   npm run tenants:migrate
 * Use --cloud to read .env.cloud (same convention as cloud:setup).
 */
import fs from "node:fs";
import { parse } from "dotenv";

const cloud = process.argv.includes("--cloud");
const file = cloud ? ".env.cloud" : ".env";
if (fs.existsSync(file)) for (const [k, v] of Object.entries(parse(fs.readFileSync(file)))) process.env[k] = v;
if (cloud && process.env.MIGRATE_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATE_DATABASE_URL;

async function main() {
  const { migrateAllTenants } = await import("../src/server/platform/migrate-all");
  const results = await migrateAllTenants();
  for (const r of results) console.log(`${r.error ? "✗" : "✓"} ${r.slug} (${r.schema}): ${r.error ?? (r.applied.length ? `applied ${r.applied.join(", ")}` : "up to date")}`);
  process.exit(results.some((r) => r.error) ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
