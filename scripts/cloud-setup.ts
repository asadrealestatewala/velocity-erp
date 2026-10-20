/**
 * Creates the schema (and, unless --migrate-only, the demo data) in the cloud database described by .env.cloud.
 * Run from your own machine:   npm run cloud:setup            (tables + demo data, once)
 *                              npm run cloud:setup -- --migrate-only   (after adding a migration)
 * It uses MIGRATE_DATABASE_URL (Supabase session pooler, port 5432) and never prints a connection string.
 */
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile(".env.cloud");
} catch {
  console.error("✗ .env.cloud not found. Create it first (see DEPLOY.md).");
  process.exit(1);
}

const url = process.env.MIGRATE_DATABASE_URL ?? "";
if (!url || /FILL-IN/.test(url)) {
  console.error("✗ MIGRATE_DATABASE_URL in .env.cloud still needs your Supabase session-pooler connection string.");
  process.exit(1);
}
if (/\[YOUR-PASSWORD\]|YOUR-PASSWORD/i.test(url)) {
  console.error("✗ MIGRATE_DATABASE_URL still contains the [YOUR-PASSWORD] placeholder — replace it with the database password.");
  process.exit(1);
}
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("✗ MIGRATE_DATABASE_URL isn't a valid connection string.");
  process.exit(1);
}
if (/^(localhost|127\.|::1)/.test(host)) {
  console.error("✗ That connection string points at this computer. This script only targets the cloud database.");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: url };
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) {
    console.error(`✗ \`${cmd} ${args.join(" ")}\` failed.`);
    process.exit(r.status ?? 1);
  }
};

console.log(`Applying migrations to ${host} …`);
run("npx", ["prisma", "migrate", "deploy"]);
if (!process.argv.includes("--migrate-only")) {
  console.log("Seeding demo data …");
  run("npx", ["tsx", "--conditions=react-server", "prisma/seed.ts"]);
}
console.log("✓ Cloud database is ready.");
