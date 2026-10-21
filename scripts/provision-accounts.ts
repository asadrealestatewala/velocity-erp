/**
 * Creates the Procurement department accounts and the Dealerships Head accounts, in the local database and (with
 * --cloud) the cloud database, using the same one-time temporary passwords in both. Safe to run again: accounts that
 * already exist keep their password; only missing accounts, roles and dealership assignments are added.
 *
 *   npm run accounts:provision              local database only (.env)
 *   npm run accounts:provision -- --cloud   local + cloud (MIGRATE_DATABASE_URL in .env.cloud)
 *
 * Temporary passwords are printed once at the end; every account must change its password at first sign-in.
 * Edit the lists below to change who is created.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { parseEnv } from "node:util";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { syncPermissionCatalog } from "../src/server/permission-sync";

type Person = { email: string; name: string };
/** Central staff responsible for product and inventory supply: spare parts, bike models, dealer prices, stock orders. */
const PROCUREMENT: Person[] = [
  { email: "procurement.manager@yadea-demo.local", name: "Procurement Manager" },
  { email: "procurement.supply@yadea-demo.local", name: "Inventory & Supply Officer" },
];
/** A Dealerships Head oversees these dealerships (by code). Change or add dealerships any time from the CRM dealership's Team panel. */
const HEADS: (Person & { region: string; dealerships: string[] })[] = [
  { email: "head.punjab@yadea-demo.local", name: "Punjab Region Head", region: "Punjab", dealerships: ["LHR-01", "LHR-02", "FSD-01"] },
  { email: "head.sindh@yadea-demo.local", name: "Sindh Region Head", region: "Sindh", dealerships: ["KHI-01"] },
  { email: "head.islamabad@yadea-demo.local", name: "Islamabad Region Head", region: "Islamabad Capital Territory", dealerships: ["ISB-01"] },
  { email: "head.kpk@yadea-demo.local", name: "Khyber Pakhtunkhwa Region Head", region: "Khyber Pakhtunkhwa", dealerships: ["PEW-01"] },
];

const temp = () => `Yd-${randomBytes(6).toString("base64url")}-${Math.floor(10 + Math.random() * 89)}`;

async function provision(label: string, url: string, passwords: Map<string, string>) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const sync = await syncPermissionCatalog(client);
    console.log(`[${label}] roles/permissions synced (roles created: ${sync.rolesCreated.join(", ") || "none"}; grants added: ${sync.grantsAdded})`);
    const roles = Object.fromEntries((await client.role.findMany()).map((r) => [r.key, r.id]));
    const ensureUser = async (p: Person, roleKey: string) => {
      const found = await client.user.findUnique({ where: { email: p.email } });
      if (found) return { id: found.id, created: false };
      const pw = passwords.get(p.email) ?? temp();
      passwords.set(p.email, pw);
      const u = await client.user.create({ data: { email: p.email, name: p.name, passwordHash: await bcrypt.hash(pw, 12), roleId: roles[roleKey]!, mustChangePassword: true } });
      return { id: u.id, created: true };
    };
    for (const p of PROCUREMENT) {
      const r = await ensureUser(p, "PROCUREMENT");
      console.log(`[${label}] ${r.created ? "created" : "exists "} ${p.email} (Procurement & Accounts)`);
    }
    for (const h of HEADS) {
      const r = await ensureUser(h, "DEALERSHIP_HEAD");
      const done: string[] = [];
      for (const code of h.dealerships) {
        const d = await client.dealership.findUnique({ where: { code } });
        if (!d) { console.log(`[${label}]   ! dealership ${code} not found — skipped`); continue; }
        await client.dealershipMembership.upsert({ where: { userId_dealershipId: { userId: r.id, dealershipId: d.id } }, create: { userId: r.id, dealershipId: d.id, role: "MANAGER" }, update: { role: "MANAGER", isActive: true } });
        done.push(code);
      }
      console.log(`[${label}] ${r.created ? "created" : "exists "} ${h.email} (Dealerships Head, ${h.region}) → ${done.join(", ")}`);
    }
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const local = (() => { try { return parseEnv(fs.readFileSync(".env", "utf8")).DATABASE_URL; } catch { return undefined; } })();
  if (!local) { console.error("✗ No DATABASE_URL in .env for the local database."); process.exit(1); }
  const passwords = new Map<string, string>();
  await provision("local", local, passwords);
  if (process.argv.includes("--cloud")) {
    let cloud: string | undefined;
    try { cloud = parseEnv(fs.readFileSync(".env.cloud", "utf8")).MIGRATE_DATABASE_URL; } catch { /* handled below */ }
    if (!cloud || /FILL-IN|YOUR-PASSWORD/.test(cloud)) { console.error("✗ .env.cloud has no usable MIGRATE_DATABASE_URL."); process.exit(1); }
    await provision("cloud", cloud, passwords);
  }
  if (passwords.size) {
    console.log("\nOne-time temporary passwords (each user must change theirs at first sign-in):");
    for (const [email, pw] of passwords) console.log(`  ${email}   ${pw}`);
  } else {
    console.log("\nNo new accounts were needed — everything already existed.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
