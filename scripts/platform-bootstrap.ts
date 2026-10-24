/**
 * One-time (and safe to repeat) platform setup: default plans, the original install as the first workspace, and the
 * first platform OWNER from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD. `npm run platform:bootstrap`
 */
import { loadEnvFile } from "node:process";
try { loadEnvFile(process.argv.includes("--cloud") ? ".env.cloud" : ".env"); } catch { /* env may already be set */ }
import { ensureFirstAdmin } from "../src/server/platform/admin-auth";
import { ensureDefaultPlans } from "../src/server/platform/plans";
import { ensureLegacyTenant } from "../src/server/platform/tenants";

async function main() {
  await ensureDefaultPlans();
  const legacy = await ensureLegacyTenant();
  const created = await ensureFirstAdmin();
  console.log(`Plans ready. Original workspace "${legacy.slug}" registered (${legacy.dbSchema} schema).`);
  console.log(created ? `Platform owner created: ${process.env.PLATFORM_ADMIN_EMAIL}` : "Platform owner: unchanged (already exists, or PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
