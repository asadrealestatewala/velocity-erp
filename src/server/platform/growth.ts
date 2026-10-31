import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformDb } from "./client";

const DAY = 86_400_000;
export const dayOf = (d: Date) => new Date(d.toISOString().slice(0, 10));

const seenToday = new Map<string, string>();

/**
 * Records that a workspace was used today (one row per workspace per day) and refreshes `lastSeenAt`.
 * Throttled in memory to one write per workspace per day per server process; never throws, never blocks a request.
 */
export async function touchActivity(t: Pick<Tenant, "id" | "isLegacy">, now = new Date()): Promise<void> {
  if (t.isLegacy) return;
  const day = dayOf(now);
  const key = day.toISOString();
  if (seenToday.get(t.id) === key) return;
  seenToday.set(t.id, key);
  try {
    const db = platformDb();
    await db.tenantActivity.upsert({ where: { tenantId_day: { tenantId: t.id, day } }, create: { tenantId: t.id, day }, update: {} });
    await db.tenant.update({ where: { id: t.id }, data: { lastSeenAt: now } });
  } catch {
    seenToday.delete(t.id);
  }
}
export const clearActivityThrottle = () => seenToday.clear();

export type Funnel = {
  from: Date;
  to: Date;
  steps: { key: string; label: string; count: number; /** share of the previous step, or null when there is none */ rate: number | null }[];
};

/** Visit → sign-up page → signed up → confirmed email → came back on a later day → paid. Every count is a query over real records. */
export async function getFunnel(from: Date, to: Date): Promise<Funnel> {
  const db = platformDb();
  const [views, tenants] = await Promise.all([
    db.pageView.findMany({ where: { day: { gte: dayOf(from), lte: dayOf(to) }, path: { in: ["/", "/signup"] } } }),
    db.tenant.findMany({
      where: { isLegacy: false, createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true, emailConfirmedAt: true, activity: { select: { day: true } }, invoices: { where: { status: "PAID" }, select: { id: true }, take: 1 } },
    }),
  ]);
  const sum = (p: string) => views.filter((v) => v.path === p).reduce((n, v) => n + v.count, 0);
  const counts: [string, string, number][] = [
    ["home", "Visited the home page", sum("/")],
    ["signupPage", "Opened the sign-up page", sum("/signup")],
    ["signedUp", "Created a workspace", tenants.length],
    ["confirmed", "Confirmed their email", tenants.filter((t) => t.emailConfirmedAt).length],
    ["returned", "Came back on another day", tenants.filter((t) => t.activity.some((a) => a.day > dayOf(t.createdAt))).length],
    ["paid", "Paid", tenants.filter((t) => t.invoices.length).length],
  ];
  return { from, to, steps: counts.map(([key, label, count], i) => ({ key, label, count, rate: i === 0 || counts[i - 1]![2] === 0 ? null : count / counts[i - 1]![2] })) };
}

export type CohortRow = { weekStart: string; size: number; /** retention[n] = share active in week n after signup; null when that week has not finished yet */ retention: (number | null)[] };

/** Weekly sign-up cohorts and the share of each that was active in week 0…weeks-1 after signing up. */
export async function getCohorts(weeks = 8, now = new Date()): Promise<CohortRow[]> {
  const startOfWeek = (d: Date) => { const x = dayOf(d); return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY); };
  const first = new Date(startOfWeek(now).getTime() - (weeks - 1) * 7 * DAY);
  const tenants = await platformDb().tenant.findMany({ where: { isLegacy: false, createdAt: { gte: first } }, select: { createdAt: true, activity: { select: { day: true } } } });
  const rows: CohortRow[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(first.getTime() + w * 7 * DAY);
    const we = new Date(ws.getTime() + 7 * DAY);
    const members = tenants.filter((t) => t.createdAt >= ws && t.createdAt < we);
    const retention = Array.from({ length: weeks - w }, (_, n) => {
      const from = new Date(dayOf(ws).getTime() + n * 7 * DAY);
      const to = new Date(from.getTime() + 7 * DAY);
      if (to > now && n > 0) return null; // week not over: not comparable
      if (!members.length) return null;
      // Week n is measured from each member's own sign-up date, not the cohort's week start.
      const active = members.filter((t) => { const s = dayOf(t.createdAt).getTime() + n * 7 * DAY; return t.activity.some((a) => a.day.getTime() >= s && a.day.getTime() < s + 7 * DAY); });
      return active.length / members.length;
    });
    rows.push({ weekStart: ws.toISOString().slice(0, 10), size: members.length, retention });
  }
  return rows;
}
