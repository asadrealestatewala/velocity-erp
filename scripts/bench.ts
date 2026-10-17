/**
 * Page-load benchmark: signs in as a seeded user by creating a short-lived session row,
 * then times server responses for the main routes.
 *
 *   npx tsx scripts/bench.ts [baseUrl] [rounds] [email]
 *   e.g. npx tsx scripts/bench.ts http://localhost:3000 5 admin@yadea-demo.local
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] ?? "http://localhost:3000";
const rounds = Number(process.argv[3] ?? 5);
const email = process.argv[4] ?? "admin@yadea-demo.local";
const db = new PrismaClient();

const CRM = [
  "/crm/dashboard", "/crm/contacts", "/crm/pipeline", "/crm/pipeline?view=table", "/crm/submissions", "/crm/forms", "/crm/test-drives",
  "/crm/test-drives?view=calendar", "/crm/dealerships", "/crm/applications", "/crm/bike-models", "/crm/tasks", "/crm/reports",
  "/crm/leaderboard", "/crm/notifications", "/crm/users", "/crm/settings", "/crm/audit",
];
const PORTAL = [
  "/portal/dashboard", "/portal/leads", "/portal/contacts", "/portal/pipeline", "/portal/test-drives", "/portal/tasks",
  "/portal/team", "/portal/leaderboard", "/portal/analytics", "/portal/notifications", "/portal/settings",
];

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true } });
  const token = randomBytes(32).toString("base64url");
  const id = createHash("sha256").update(token).digest("hex");
  await db.session.create({ data: { id, userId: user.id, expiresAt: new Date(Date.now() + 3600_000), userAgent: "bench" } });
  const routes = user.role.scope === "CENTRAL" ? CRM : PORTAL;
  const contact = await db.contact.findFirst({ where: user.role.scope === "CENTRAL" ? {} : { leads: { some: { dealership: { memberships: { some: { userId: user.id } } } } } }, select: { id: true } });
  if (contact) routes.push(`${user.role.scope === "CENTRAL" ? "/crm" : "/portal"}/contacts/${contact.id}`);
  const form = await db.form.findFirst({ select: { id: true } });
  if (form && user.role.scope === "CENTRAL") routes.push(`/crm/forms/${form.id}`);
  routes.push("/forms/test-drive");

  const headers = { cookie: `yadea_session=${token}` };
  const results: { route: string; first: number; median: number; status: number }[] = [];
  try {
    for (const r of routes) {
      const times: number[] = [];
      let status = 0;
      for (let i = 0; i < rounds; i++) {
        const t = performance.now();
        const res = await fetch(base + r, { headers, redirect: "manual" });
        await res.arrayBuffer();
        times.push(performance.now() - t);
        status = res.status;
      }
      const sorted = [...times].slice(1).sort((a, b) => a - b);
      results.push({ route: r, first: Math.round(times[0]!), median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? times[0]!), status });
      process.stdout.write(".");
    }
  } finally {
    await db.session.delete({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }
  console.log(`\n${base} as ${email} (${rounds} rounds; "first" may include compilation in dev)`);
  console.table(results);
  const med = results.map((r) => r.median).sort((a, b) => a - b);
  console.log(`median of medians: ${med[Math.floor(med.length / 2)]} ms · slowest: ${results.reduce((a, b) => (b.median > a.median ? b : a)).route}`);
}

main();
