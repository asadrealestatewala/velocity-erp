import "server-only";
import { unstable_cache } from "next/cache";
import { platformDb } from "./client";

export type ByCurrency = Record<string, number>;
const add = (m: ByCurrency, cur: string, n: number) => void (m[cur] = (m[cur] ?? 0) + n);

export type Metrics = {
  from: Date;
  to: Date;
  workspaces: { total: number; bySubscription: Record<string, number>; byStatus: Record<string, number> };
  /** Recurring revenue from ACTIVE subscriptions (yearly ÷ 12). Never mixes currencies. */
  mrr: ByCurrency;
  mrrAtRisk: ByCurrency;
  /** Run-rate (MRR × 12): forward-looking, NOT recognised revenue. */
  arr: ByCurrency;
  invoiced: ByCurrency;
  collected: ByCurrency;
  refunds: ByCurrency;
  net: ByCurrency;
  signups: number;
  trial: { ended: number; converted: number; rate: number | null };
  churned: number;
  pendingPayments: { count: number; value: ByCurrency };
  signupsByDay: { day: string; count: number }[];
};

/**
 * Every figure is a query over real records (nothing stored, nothing estimated):
 *  MRR = Σ price of ACTIVE subscriptions (yearly ÷ 12) · ARR = MRR × 12 · Collected = PAID invoices by payment date
 *  Net = Collected − Refunds made in the period · Trial conversion = trials ending in the period that have a paid invoice
 *  Churn = subscriptions that moved from ACTIVE/PAST_DUE to CANCELED/EXPIRED/SUSPENDED in the period.
 * The original (legacy) workspace is excluded: it is not a customer.
 */
export async function getMetrics(from: Date, to: Date): Promise<Metrics> {
  const db = platformDb();
  const notLegacy = { isLegacy: false } as const;
  const sumByCurrency = (rows: { currency: string; _sum: { amount: number | null } }[]) => rows.reduce((m, r) => (add(m, r.currency, r._sum.amount ?? 0), m), {} as ByCurrency);

  // Everything is computed in the database (counts and sums), so the work no longer grows with the number of rows.
  const [tenantGroups, issued, paid, refunds, signups, trialsEnded, trialsConverted, churnedRows, pending] = await Promise.all([
    db.tenant.groupBy({ by: ["subStatus", "status", "interval", "priceCurrency"], where: notLegacy, _count: true, _sum: { priceAmount: true } }),
    db.invoice.groupBy({ by: ["currency"], where: { issuedAt: { gte: from, lte: to }, tenant: notLegacy }, _sum: { amount: true } }),
    db.invoice.groupBy({ by: ["currency"], where: { status: "PAID", paidAt: { gte: from, lte: to }, tenant: notLegacy }, _sum: { amount: true } }),
    db.refund.groupBy({ by: ["currency"], where: { at: { gte: from, lte: to }, invoice: { tenant: notLegacy } }, _sum: { amount: true } }),
    db.tenant.findMany({ where: { ...notLegacy, createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
    db.tenant.count({ where: { ...notLegacy, trialStartedAt: { not: null }, trialEndsAt: { gte: from, lte: to } } }),
    db.tenant.count({ where: { ...notLegacy, trialStartedAt: { not: null }, trialEndsAt: { gte: from, lte: to }, invoices: { some: { status: "PAID" } } } }),
    db.subscriptionHistory.findMany({ where: { at: { gte: from, lte: to }, fromStatus: { in: ["ACTIVE", "PAST_DUE"] }, toStatus: { in: ["CANCELED", "EXPIRED", "SUSPENDED"] }, tenant: notLegacy }, select: { tenantId: true }, distinct: ["tenantId"] }),
    db.payment.groupBy({ by: ["currency"], where: { status: "PENDING" }, _count: true, _sum: { amount: true } }),
  ]);

  const bySubscription: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const mrr: ByCurrency = {};
  const mrrAtRisk: ByCurrency = {};
  let totalTenants = 0;
  for (const g of tenantGroups) {
    totalTenants += g._count;
    bySubscription[g.subStatus] = (bySubscription[g.subStatus] ?? 0) + g._count;
    byStatus[g.status] = (byStatus[g.status] ?? 0) + g._count;
    const amount = g._sum.priceAmount ?? 0;
    const monthly = g.interval === "YEAR" ? amount / 12 : amount;
    if (g.subStatus === "ACTIVE" && g.status === "ACTIVE") add(mrr, g.priceCurrency, monthly);
    if (g.subStatus === "PAST_DUE") add(mrrAtRisk, g.priceCurrency, monthly);
  }
  const round = (m: ByCurrency) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]));
  const arr = Object.fromEntries(Object.entries(mrr).map(([k, v]) => [k, Math.round(v * 12)]));

  const invoiced = sumByCurrency(issued);
  const collected = sumByCurrency(paid);
  const refunded = sumByCurrency(refunds);
  const net: ByCurrency = { ...collected };
  for (const [c, v] of Object.entries(refunded)) add(net, c, -v);
  const byDay = new Map<string, number>();
  for (const s of signups) { const k = s.createdAt.toISOString().slice(0, 10); byDay.set(k, (byDay.get(k) ?? 0) + 1); }

  return {
    from, to,
    workspaces: { total: totalTenants, bySubscription, byStatus },
    mrr: round(mrr), mrrAtRisk: round(mrrAtRisk), arr,
    invoiced, collected, refunds: refunded, net,
    signups: signups.length,
    trial: { ended: trialsEnded, converted: trialsConverted, rate: trialsEnded ? Math.round((trialsConverted / trialsEnded) * 100) : null },
    churned: churnedRows.length,
    pendingPayments: { count: pending.reduce((n, g) => n + g._count, 0), value: sumByCurrency(pending) },
    signupsByDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
  };
}

/** Overview figures for the last `days` days, shared across requests for 30 seconds (the window is rounded to the minute so the cache key is stable). */
export async function getMetricsCached(days: number): Promise<Metrics> {
  const minute = Math.floor(Date.now() / 60_000);
  const m = await unstable_cache(
    async (d: number, atMinute: number) => {
      const to = new Date(atMinute * 60_000);
      return getMetrics(new Date(to.getTime() - d * 86_400_000), to);
    },
    ["platform-metrics"],
    { revalidate: 30 },
  )(days, minute);
  return { ...m, from: new Date(m.from), to: new Date(m.to) };
}
