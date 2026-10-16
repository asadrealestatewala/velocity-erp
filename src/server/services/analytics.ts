import "server-only";
import type { GoalMetric, Prisma } from "@prisma/client";
import { addDays, differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import { pct } from "@/lib/utils";

/**
 * Metric definitions (used consistently across dashboards and reports):
 *  - Lead-to-customer conversion rate = leads created in the period that are now converted ÷ leads created in the period.
 *  - Test-drive completion rate = bookings completed ÷ bookings due in the period (excluding still-pending future ones).
 *  - Recognised sales revenue = sum of conversion values recorded on converted leads (convertedAt in period).
 *  - Recorded payments = sum of payments with status PAID (manually entered; not independently verified).
 *  - First response time = hours from assignment (or creation, if never assigned) to first logged outbound interaction.
 */

export type AnalyticsFilters = {
  from: Date;
  to: Date;
  cityId?: string;
  dealershipId?: string;
  sourceId?: string;
  stageId?: string;
  ownerId?: string;
  origin?: "COMPANY" | "DEALERSHIP_WALK_IN";
};

export function parseRange(sp: Record<string, string | undefined>, defaultDays = 30) {
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay(new Date());
  const from = sp.from ? startOfDay(new Date(sp.from)) : startOfDay(subDays(to, defaultDays - 1));
  return { from: isNaN(from.getTime()) ? startOfDay(subDays(new Date(), defaultDays - 1)) : from, to: isNaN(to.getTime()) ? endOfDay(new Date()) : to };
}

function leadWhere(scope: Prisma.LeadWhereInput, f: Partial<AnalyticsFilters>): Prisma.LeadWhereInput {
  return {
    AND: [
      scope,
      { isArchived: false },
      f.cityId ? { cityId: f.cityId } : {},
      f.dealershipId ? { dealershipId: f.dealershipId } : {},
      f.sourceId ? { sourceId: f.sourceId } : {},
      f.stageId ? { stageId: f.stageId } : {},
      f.ownerId ? { OR: [{ ownerId: f.ownerId }, { assignedUserId: f.ownerId }] } : {},
      f.origin ? { origin: f.origin } : {},
    ],
  };
}

const delta = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10);

export async function getKpis(scope: Prisma.LeadWhereInput, f: AnalyticsFilters, opts: { central: boolean; contactScope?: Prisma.ContactWhereInput; testDriveScope?: Prisma.TestDriveBookingWhereInput; dealershipIds?: string[] }) {
  const span = differenceInCalendarDays(f.to, f.from) + 1;
  const prevFrom = subDays(f.from, span);
  const prevTo = subDays(f.to, span);
  const base = leadWhere(scope, f);
  const inRange = (field: string, a: Date, b: Date) => ({ [field]: { gte: a, lte: b } });
  const now = new Date();
  const tdBase: Prisma.TestDriveBookingWhereInput = {
    AND: [opts.testDriveScope ?? {}, f.dealershipId ? { dealershipId: f.dealershipId } : {}, f.cityId ? { cityId: f.cityId } : {}],
  };

  const [
    totalContacts, newContacts, prevContacts, totalLeads, leadsInPeriod, leadsPrev, newToday, followUp, assigned, unassigned,
    tdScheduled, tdCreated, tdCreatedPrev, tdCompleted, tdCompletedPrev, converted, convertedPrev, lost, lostPrev,
    cohortConverted, pendingApps, activeDealers, sales, salesPrev, payments,
  ] = await Promise.all([
    db.contact.count({ where: { AND: [opts.contactScope ?? {}, { isArchived: false }] } }),
    db.contact.count({ where: { AND: [opts.contactScope ?? {}, inRange("createdAt", f.from, f.to)] } }),
    db.contact.count({ where: { AND: [opts.contactScope ?? {}, inRange("createdAt", prevFrom, prevTo)] } }),
    db.lead.count({ where: base }),
    db.lead.count({ where: { AND: [base, inRange("createdAt", f.from, f.to)] } }),
    db.lead.count({ where: { AND: [base, inRange("createdAt", prevFrom, prevTo)] } }),
    db.lead.count({ where: { AND: [base, inRange("createdAt", startOfDay(now), endOfDay(now))] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "OPEN" } }, { nextFollowUpAt: { lte: endOfDay(now) } }] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "OPEN" } }, { dealershipId: { not: null } }] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "OPEN" } }, { dealershipId: null }] } }),
    db.testDriveBooking.count({ where: { AND: [tdBase, { status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] } }, { scheduledAt: { gte: now } }] } }),
    db.testDriveBooking.count({ where: { AND: [tdBase, inRange("createdAt", f.from, f.to)] } }),
    db.testDriveBooking.count({ where: { AND: [tdBase, inRange("createdAt", prevFrom, prevTo)] } }),
    db.testDriveBooking.count({ where: { AND: [tdBase, { status: "COMPLETED" }, inRange("completedAt", f.from, f.to)] } }),
    db.testDriveBooking.count({ where: { AND: [tdBase, { status: "COMPLETED" }, inRange("completedAt", prevFrom, prevTo)] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "WON" } }, inRange("convertedAt", f.from, f.to)] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "WON" } }, inRange("convertedAt", prevFrom, prevTo)] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "LOST" } }, inRange("lostAt", f.from, f.to)] } }),
    db.lead.count({ where: { AND: [base, { stage: { kind: "LOST" } }, inRange("lostAt", prevFrom, prevTo)] } }),
    db.lead.count({ where: { AND: [base, inRange("createdAt", f.from, f.to), { stage: { kind: "WON" } }] } }),
    opts.central ? db.dealershipApplication.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"] } } }) : Promise.resolve(0),
    opts.central ? db.dealership.count({ where: { status: "ACTIVE" } }) : Promise.resolve(0),
    db.lead.aggregate({ where: { AND: [base, { stage: { kind: "WON" } }, inRange("convertedAt", f.from, f.to)] }, _sum: { conversionValue: true } }),
    db.lead.aggregate({ where: { AND: [base, { stage: { kind: "WON" } }, inRange("convertedAt", prevFrom, prevTo)] }, _sum: { conversionValue: true } }),
    db.payment.aggregate({
      where: {
        status: "PAID",
        paymentDate: { gte: f.from, lte: f.to },
        ...(opts.dealershipIds ? { dealershipId: { in: opts.dealershipIds } } : {}),
        ...(f.dealershipId ? { dealershipId: f.dealershipId } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const salesNow = Number(sales._sum.conversionValue ?? 0);
  const salesBefore = Number(salesPrev._sum.conversionValue ?? 0);
  return {
    totalContacts, newContacts, contactsDelta: delta(newContacts, prevContacts),
    totalLeads, leadsInPeriod, leadsDelta: delta(leadsInPeriod, leadsPrev), newToday, followUp, assigned, unassigned,
    tdScheduled, tdCreated, tdCreatedDelta: delta(tdCreated, tdCreatedPrev), tdCompleted, tdCompletedDelta: delta(tdCompleted, tdCompletedPrev),
    converted, convertedDelta: delta(converted, convertedPrev), lost, lostDelta: delta(lost, lostPrev),
    conversionRate: pct(cohortConverted, leadsInPeriod), pendingApps, activeDealers,
    salesRevenue: salesNow, salesDelta: delta(salesNow, salesBefore), recordedPayments: Number(payments._sum.amount ?? 0),
  };
}

export async function getCharts(scope: Prisma.LeadWhereInput, f: AnalyticsFilters, tdScope: Prisma.TestDriveBookingWhereInput = {}) {
  const base = leadWhere(scope, f);
  const period = { AND: [base, { createdAt: { gte: f.from, lte: f.to } }] };
  const [created, bySource, byStage, byCity, byDealer, sources, stages, cities, dealers, tdCreated, tdDone, byOrigin, lossReasons, lossRows] = await Promise.all([
    db.lead.findMany({ where: period, select: { createdAt: true, stage: { select: { kind: true } } } }),
    db.lead.groupBy({ by: ["sourceId"], where: period, _count: { _all: true } }),
    db.lead.groupBy({ by: ["stageId"], where: base, _count: { _all: true } }),
    db.lead.groupBy({ by: ["cityId"], where: period, _count: { _all: true } }),
    db.lead.groupBy({ by: ["dealershipId"], where: period, _count: { _all: true } }),
    db.leadSource.findMany(),
    db.leadStage.findMany({ orderBy: { sortOrder: "asc" } }),
    db.city.findMany({ select: { id: true, name: true } }),
    db.dealership.findMany({ select: { id: true, name: true, code: true } }),
    db.testDriveBooking.findMany({ where: { AND: [tdScope, f.dealershipId ? { dealershipId: f.dealershipId } : {}, { createdAt: { gte: f.from, lte: f.to } }] }, select: { createdAt: true } }),
    db.testDriveBooking.findMany({ where: { AND: [tdScope, f.dealershipId ? { dealershipId: f.dealershipId } : {}, { status: "COMPLETED", completedAt: { gte: f.from, lte: f.to } }] }, select: { completedAt: true } }),
    db.lead.groupBy({ by: ["origin"], where: period, _count: { _all: true } }),
    db.lossReason.findMany(),
    db.lead.groupBy({ by: ["lossReasonId"], where: { AND: [base, { lostAt: { gte: f.from, lte: f.to } }, { lossReasonId: { not: null } }] }, _count: { _all: true } }),
  ]);

  const days = differenceInCalendarDays(f.to, f.from) + 1;
  const bucket = days > 120 ? "month" : days > 45 ? "week" : "day";
  const keyOf = (d: Date) =>
    bucket === "day" ? format(d, "yyyy-MM-dd") : bucket === "week" ? format(startOfDay(subDays(d, (d.getDay() + 6) % 7)), "yyyy-MM-dd") : format(d, "yyyy-MM");
  const labelOf = (k: string) => (bucket === "month" ? format(new Date(k + "-01"), "MMM yy") : format(new Date(k), "dd MMM"));
  const series = new Map<string, { leads: number; converted: number; tdBooked: number; tdCompleted: number }>();
  for (let d = startOfDay(f.from); d <= f.to; d = addDays(d, 1)) {
    const k = keyOf(d);
    if (!series.has(k)) series.set(k, { leads: 0, converted: 0, tdBooked: 0, tdCompleted: 0 });
  }
  for (const l of created) {
    const s = series.get(keyOf(l.createdAt));
    if (s) {
      s.leads++;
      if (l.stage.kind === "WON") s.converted++;
    }
  }
  for (const t of tdCreated) series.get(keyOf(t.createdAt)) && series.get(keyOf(t.createdAt))!.tdBooked++;
  for (const t of tdDone) t.completedAt && series.get(keyOf(t.completedAt)) && series.get(keyOf(t.completedAt))!.tdCompleted++;

  const name = <T extends { id: string; name: string }>(list: T[], id: string | null, fallback: string) => list.find((x) => x.id === id)?.name ?? fallback;
  return {
    bucket,
    trend: [...series.entries()].map(([k, v]) => ({ label: labelOf(k), ...v })),
    bySource: bySource.map((r) => ({ name: name(sources, r.sourceId, "Unknown"), value: r._count._all })).sort((a, b) => b.value - a.value),
    byStage: stages.filter((s) => s.isActive).map((s) => ({ name: s.name, color: s.color, value: byStage.find((r) => r.stageId === s.id)?._count._all ?? 0 })),
    byCity: byCity.map((r) => ({ name: name(cities, r.cityId, "No city"), value: r._count._all })).sort((a, b) => b.value - a.value).slice(0, 10),
    byDealership: byDealer.map((r) => ({ name: r.dealershipId ? name(dealers, r.dealershipId, "?") : "Unassigned", value: r._count._all })).sort((a, b) => b.value - a.value).slice(0, 10),
    byOrigin: byOrigin.map((r) => ({ name: r.origin === "COMPANY" ? "Company-assigned" : "Walk-in", value: r._count._all })),
    lossReasons: lossRows.map((r) => ({ name: name(lossReasons, r.lossReasonId, "Other"), value: r._count._all })).sort((a, b) => b.value - a.value),
  };
}

/** Per-dealership performance table (normalised rates so small and large outlets compare fairly). */
export async function getDealershipPerformance(f: AnalyticsFilters, dealershipIds?: string[]) {
  const dealers = await db.dealership.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] }, ...(dealershipIds ? { id: { in: dealershipIds } } : {}), ...(f.cityId ? { cityId: f.cityId } : {}) },
    select: { id: true, name: true, code: true, city: { select: { name: true } } },
  });
  const ids = dealers.map((d) => d.id);
  const range = { gte: f.from, lte: f.to };
  const [leads, conv, tdDone, tdDue, responded, revenue, points] = await Promise.all([
    db.lead.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, createdAt: range, isArchived: false }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, convertedAt: range, stage: { kind: "WON" } }, _count: { _all: true } }),
    db.testDriveBooking.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, status: "COMPLETED", completedAt: range }, _count: { _all: true } }),
    db.testDriveBooking.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, scheduledAt: { gte: f.from, lte: new Date(Math.min(f.to.getTime(), Date.now())) }, status: { not: "CANCELLED" } }, _count: { _all: true } }),
    db.lead.findMany({ where: { dealershipId: { in: ids }, assignedAt: range, firstContactedAt: { not: null } }, select: { dealershipId: true, assignedAt: true, firstContactedAt: true } }),
    db.lead.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, convertedAt: range, stage: { kind: "WON" } }, _sum: { conversionValue: true } }),
    db.gamificationEvent.groupBy({ by: ["dealershipId"], where: { dealershipId: { in: ids }, createdAt: range }, _sum: { points: true } }),
  ]);
  const get = <T extends { dealershipId: string | null }>(rows: T[], id: string) => rows.find((r) => r.dealershipId === id);
  return dealers
    .map((d) => {
      const nLeads = get(leads, d.id)?._count._all ?? 0;
      const nConv = get(conv, d.id)?._count._all ?? 0;
      const nTd = get(tdDone, d.id)?._count._all ?? 0;
      const nDue = get(tdDue, d.id)?._count._all ?? 0;
      const resp = responded.filter((r) => r.dealershipId === d.id);
      const avgResp = resp.length ? resp.reduce((a, r) => a + (r.firstContactedAt!.getTime() - r.assignedAt!.getTime()) / 3600_000, 0) / resp.length : null;
      return {
        id: d.id, name: d.name, code: d.code, city: d.city.name, leads: nLeads, converted: nConv, conversionRate: pct(nConv, nLeads),
        testDrivesCompleted: nTd, testDriveCompletionRate: pct(nTd, nDue), avgResponseHours: avgResp === null ? null : Math.round(avgResp * 10) / 10,
        revenue: Number(get(revenue, d.id)?._sum.conversionValue ?? 0), points: get(points, d.id)?._sum.points ?? 0,
      };
    })
    .sort((a, b) => b.conversionRate - a.conversionRate || b.converted - a.converted);
}

export type LeaderboardRow = {
  id: string; name: string; subtitle?: string; points: number; converted: number; leads: number; conversionRate: number;
  testDrives: number; followUpsOnTime: number; followUpRate: number; score: number;
};

/**
 * Leaderboard ranked by a normalised performance score (0–100):
 * 40% conversion rate + 30% on-time follow-up rate + 30% points per lead (capped),
 * so a small outlet with great rates can outrank a big one with mediocre rates.
 */
export async function getLeaderboard(by: "rep" | "dealership" | "city", f: { from: Date; to: Date }, restrictDealershipIds?: string[]): Promise<LeaderboardRow[]> {
  const range = { gte: f.from, lte: f.to };
  const dealerFilter = restrictDealershipIds ? { in: restrictDealershipIds } : undefined;
  const [events, leads, conv, tds, tasks] = await Promise.all([
    db.gamificationEvent.findMany({ where: { createdAt: range, ...(dealerFilter ? { dealershipId: dealerFilter } : { dealershipId: { not: null } }) }, select: { userId: true, dealershipId: true, points: true } }),
    db.lead.findMany({ where: { assignedAt: range, dealershipId: dealerFilter ?? { not: null } }, select: { assignedUserId: true, dealershipId: true, cityId: true } }),
    db.lead.findMany({ where: { convertedAt: range, stage: { kind: "WON" }, dealershipId: dealerFilter ?? { not: null } }, select: { assignedUserId: true, dealershipId: true, cityId: true } }),
    db.testDriveBooking.findMany({ where: { completedAt: range, status: "COMPLETED", ...(dealerFilter ? { dealershipId: dealerFilter } : {}) }, select: { assignedUserId: true, dealershipId: true, cityId: true } }),
    db.task.findMany({ where: { dueAt: { gte: f.from, lte: new Date(Math.min(f.to.getTime(), Date.now())) }, status: { not: "CANCELLED" }, dealershipId: dealerFilter ?? { not: null } }, select: { assignedToId: true, dealershipId: true, status: true, completedAt: true, dueAt: true } }),
  ]);
  const dealerCity = new Map((await db.dealership.findMany({ select: { id: true, cityId: true } })).map((d) => [d.id, d.cityId]));

  const keyFor = (r: { userId?: string | null; dealershipId?: string | null; cityId?: string | null }) =>
    by === "rep" ? r.userId ?? null : by === "dealership" ? r.dealershipId ?? null : r.cityId ?? (r.dealershipId ? dealerCity.get(r.dealershipId) ?? null : null);
  const rows = new Map<string, { points: number; leads: number; converted: number; td: number; due: number; onTime: number }>();
  const row = (k: string | null) => {
    if (!k) return null;
    if (!rows.has(k)) rows.set(k, { points: 0, leads: 0, converted: 0, td: 0, due: 0, onTime: 0 });
    return rows.get(k)!;
  };
  for (const e of events) { const r = row(keyFor({ userId: e.userId, dealershipId: e.dealershipId })); if (r) r.points += e.points; }
  for (const l of leads) { const r = row(keyFor({ userId: l.assignedUserId, dealershipId: l.dealershipId, cityId: l.cityId })); if (r) r.leads++; }
  for (const l of conv) { const r = row(keyFor({ userId: l.assignedUserId, dealershipId: l.dealershipId, cityId: l.cityId })); if (r) r.converted++; }
  for (const t of tds) { const r = row(keyFor({ userId: t.assignedUserId, dealershipId: t.dealershipId, cityId: t.cityId })); if (r) r.td++; }
  for (const t of tasks) {
    const r = row(keyFor({ userId: t.assignedToId, dealershipId: t.dealershipId }));
    if (!r) continue;
    r.due++;
    if (t.status === "COMPLETED" && t.completedAt && t.completedAt <= t.dueAt) r.onTime++;
  }

  const ids = [...rows.keys()];
  const names = new Map<string, { name: string; subtitle?: string }>();
  if (by === "rep") {
    const users = await db.user.findMany({ where: { id: { in: ids }, role: { scope: "DEALERSHIP" } }, select: { id: true, name: true, memberships: { select: { dealership: { select: { name: true } } } } } });
    users.forEach((u) => names.set(u.id, { name: u.name, subtitle: u.memberships.map((m) => m.dealership.name).join(", ") }));
  } else if (by === "dealership") {
    (await db.dealership.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: { select: { name: true } } } })).forEach((d) => names.set(d.id, { name: d.name, subtitle: d.city.name }));
  } else {
    (await db.city.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).forEach((c) => names.set(c.id, { name: c.name }));
  }

  return [...rows.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, r]) => {
      const conversionRate = pct(r.converted, r.leads);
      const followUpRate = pct(r.onTime, r.due);
      const ppl = r.leads ? Math.min(100, (r.points / r.leads) * 5) : Math.min(100, r.points / 2);
      const score = Math.round(0.4 * conversionRate + 0.3 * followUpRate + 0.3 * ppl);
      return { id, ...names.get(id)!, points: r.points, converted: r.converted, leads: r.leads, conversionRate, testDrives: r.td, followUpsOnTime: r.onTime, followUpRate, score };
    })
    .sort((a, b) => b.score - a.score || b.points - a.points);
}

/** Responsiveness & follow-up discipline for a lead scope. */
export async function getOpsMetrics(scope: Prisma.LeadWhereInput, f: AnalyticsFilters, taskWhere: Prisma.TaskWhereInput, windowHours: number) {
  const range = { gte: f.from, lte: f.to };
  const [assigned, tasks] = await Promise.all([
    db.lead.findMany({ where: { AND: [leadWhere(scope, f), { OR: [{ assignedAt: range }, { assignedAt: null, createdAt: range }] }] }, select: { assignedAt: true, createdAt: true, firstContactedAt: true } }),
    db.task.findMany({ where: { AND: [taskWhere, { type: { in: ["FOLLOW_UP", "CALL"] }, status: { not: "CANCELLED" }, dueAt: { gte: f.from, lte: new Date(Math.min(f.to.getTime(), Date.now())) } }] }, select: { status: true, completedAt: true, dueAt: true } }),
  ]);
  const responded = assigned.filter((l) => l.firstContactedAt);
  const hrs = responded.map((l) => (l.firstContactedAt!.getTime() - (l.assignedAt ?? l.createdAt).getTime()) / 3600_000).filter((h) => h >= 0);
  const sorted = [...hrs].sort((a, b) => a - b);
  const onTime = tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt <= t.dueAt).length;
  const late = tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt > t.dueAt).length;
  return {
    leadsInWindow: assigned.length,
    respondedPct: pct(responded.length, assigned.length),
    avgResponseHours: hrs.length ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 10) / 10 : null,
    medianResponseHours: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]! * 10) / 10 : null,
    withinWindowPct: pct(hrs.filter((h) => h <= windowHours).length, assigned.length),
    followUpsDue: tasks.length,
    followUpsOnTimePct: pct(onTime, tasks.length),
    followUpsLate: late,
    followUpsMissed: tasks.length - onTime - late,
  };
}

/** Current value of a goal's metric inside its window. */
export async function goalProgress(g: { metric: GoalMetric; targetValue: Prisma.Decimal | number; dealershipId: string | null; userId: string | null; startsAt: Date; endsAt: Date }) {
  const range = { gte: g.startsAt, lte: g.endsAt };
  const dealer = g.dealershipId ? { dealershipId: g.dealershipId } : {};
  const user = g.userId ? { assignedUserId: g.userId } : {};
  let current = 0;
  switch (g.metric) {
    case "CONVERSIONS":
      current = await db.lead.count({ where: { ...dealer, ...user, convertedAt: range, stage: { kind: "WON" } } });
      break;
    case "TEST_DRIVES_COMPLETED":
      current = await db.testDriveBooking.count({ where: { ...dealer, ...(g.userId ? { assignedUserId: g.userId } : {}), status: "COMPLETED", completedAt: range } });
      break;
    case "SALES_REVENUE":
      current = Number((await db.lead.aggregate({ where: { ...dealer, ...user, convertedAt: range, stage: { kind: "WON" } }, _sum: { conversionValue: true } }))._sum.conversionValue ?? 0);
      break;
    case "RESPONSE_TIME_HOURS": {
      const rows = await db.lead.findMany({ where: { ...dealer, ...user, assignedAt: range, firstContactedAt: { not: null } }, select: { assignedAt: true, firstContactedAt: true } });
      current = rows.length ? Math.round((rows.reduce((a, r) => a + (r.firstContactedAt!.getTime() - r.assignedAt!.getTime()) / 3600_000, 0) / rows.length) * 10) / 10 : 0;
      break;
    }
    case "FOLLOW_UP_COMPLETION_RATE": {
      const tasks = await db.task.findMany({
        where: { ...dealer, ...(g.userId ? { assignedToId: g.userId } : {}), dueAt: { gte: g.startsAt, lte: new Date(Math.min(g.endsAt.getTime(), Date.now())) }, status: { not: "CANCELLED" } },
        select: { status: true, completedAt: true, dueAt: true },
      });
      current = pct(tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt <= t.dueAt).length, tasks.length);
      break;
    }
  }
  const target = Number(g.targetValue);
  const lowerIsBetter = g.metric === "RESPONSE_TIME_HOURS";
  const progress = lowerIsBetter ? (current === 0 ? 0 : Math.min(100, (target / current) * 100)) : Math.min(100, target ? (current / target) * 100 : 0);
  return { current, target, progress: Math.round(progress), achieved: lowerIsBetter ? current > 0 && current <= target : current >= target, lowerIsBetter };
}

export const GOAL_LABELS: Record<GoalMetric, { label: string; unit: string }> = {
  RESPONSE_TIME_HOURS: { label: "Avg. lead response time", unit: "h" },
  FOLLOW_UP_COMPLETION_RATE: { label: "Follow-up completion", unit: "%" },
  TEST_DRIVES_COMPLETED: { label: "Test drives completed", unit: "" },
  CONVERSIONS: { label: "Lead conversions", unit: "" },
  SALES_REVENUE: { label: "Sales revenue", unit: "PKR" },
};
