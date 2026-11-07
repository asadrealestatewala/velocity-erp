/**
 * Creates (or refreshes) the starter public website for one workspace. Safe to repeat; never overwrites fields the workspace already edited
 * unless --force is passed. `npm run website:seed -- yadeapakistan [--publish] [--force]`
 */
import { loadEnvFile } from "node:process";
try { loadEnvFile(".env"); } catch { /* env may already be set */ }
import { db } from "../src/lib/db";
import { runInTenant } from "../src/server/platform/runtime";
import { DEFAULT_WEBSITE, getWebsite, saveWebsite, type WebsiteConfig } from "../src/server/website";

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) { console.error("usage: website:seed <workspace-slug> [--publish] [--force]"); process.exit(1); }
const force = process.argv.includes("--force");
const publish = process.argv.includes("--publish");

const STARTER: Partial<WebsiteConfig> = {
  siteName: "Yadea Pakistan",
  tagline: "Electric scooters and bikes, sold and serviced near you",
  heroTitle: "Ride electric with Yadea",
  heroSubtitle: "Explore the range, check what is in stock at a showroom near you, and book a test drive in minutes.",
  heroImageUrl: "/brand/hero-dealership.jpg",
  primaryColor: "#e60012",
  about: "Yadea is the world's leading electric two-wheeler brand. Our authorised showrooms across Pakistan offer test rides, genuine parts, warranty and after-sales service.",
  showModels: true, showShowrooms: true, showInventory: true,
};

runInTenant(slug, async () => {
  const current = await getWebsite();
  const next: WebsiteConfig = { ...current };
  for (const [k, v] of Object.entries(STARTER) as [keyof WebsiteConfig, never][]) {
    if (force || current[k] === DEFAULT_WEBSITE[k]) (next as Record<string, unknown>)[k] = v;
  }
  if (publish) next.published = true;
  await saveWebsite(next);
  console.log(`Website saved for "${slug}" (${next.published ? "published" : "draft"}).`);
  await db.$disconnect();
})
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
