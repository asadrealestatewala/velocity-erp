import "server-only";
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
  const tenants = await db.tenant.findMany({ where: { isLegacy: false }, select: { subStatus: true, status: true, interval: true, priceAmount: true, priceCurrency: true } });
  const bySubscription: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const mrr: ByCurrency = {};
  const mrrAtRisk: ByCurrency = {};
  for (const t of tenants) {
    bySubscription[t.subStatus] = (bySubscription[t.subStatus] ?? 0) + 1;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const monthly = t.interval === "YEAR" ? t.priceAmount / 12 : t.priceAmount;
    if (t.subStatus === "ACTIVE" && t.status === "ACTIVE") add(mrr, t.priceCurrency, monthly);
    if (t.subStatus === "PAST_DUE") add(mrrAtRisk, t.priceCurrency, monthly);
  }
  const round = (m: ByCurrency) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]));
  const arr = Object.fromEntries(Object.entries(mrr).map(([k, v]) => [k, Math.round(v * 12)]));

  const [issued, paid, refunds, signups, trialsEnded, history, pending] = await Promise.all([
    db.invoice.findMany({ where: { issuedAt: { gte: from, lte: to }, tenant: { isLegacy: false } }, select: { amount: true, currency: true } }),
    db.invoice.findMany({ where: { status: "PAID", paidAt: { gte: from, lte: to }, tenant: { isLegacy: false } }, select: { amount: true, currency: true } }),
    db.refund.findMany({ where: { at: { gte: from, lte: to }, invoice: { tenant: { isLegacy: false } } }, select: { amount: true, currency: true } }),
    db.tenant.findMany({ where: { isLegacy: false, createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
    db.tenant.findMany({ where: { isLegacy: false, trialStartedAt: { not: null }, trialEndsAt: { gte: from, lte: to } }, select: { id: true, invoices: { where: { status: "PAID" }, select: { id: true }, take: 1 } } }),
    db.subscriptionHistory.findMany({ where: { at: { gte: from, lte: to }, fromStatus: { in: ["ACTIVE", "PAST_DUE"] }, toStatus: { in: ["CANCELED", "EXPIRED", "SUSPENDED"] }, tenant: { isLegacy: false } }, select: { tenantId: true } }),
    db.payment.findMany({ where: { status: "PENDING" }, select: { amount: true, currency: true } }),
  ]);
  const sum = (rows: { amount: number; currency: string }[]) => rows.reduce((m, r) => (add(m, r.currency, r.amount), m), {} as ByCurrency);
  const invoiced = sum(issued);
  const collected = sum(paid);
  const refunded = sum(refunds);
  const net: ByCurrency = { ...collected };
  for (const [c, v] of Object.entries(refunded)) add(net, c, -v);
  const converted = trialsEnded.filter((t) => t.invoices.length > 0).length;
  const byDay = new Map<string, number>();
  for (const s of signups) byDay.set(s.createdAt.toISOString().slice(0, 10), (byDay.get(s.createdAt.toISOString().slice(0, 10)) ?? 0) + 1);

  return {
    from, to,
    workspaces: { total: tenants.length, bySubscription, byStatus },
    mrr: round(mrr), mrrAtRisk: round(mrrAtRisk), arr,
    invoiced, collected, refunds: refunded, net,
    signups: signups.length,
    trial: { ended: trialsEnded.length, converted, rate: trialsEnded.length ? Math.round((converted / trialsEnded.length) * 100) : null },
    churned: new Set(history.map((h) => h.tenantId)).size,
    pendingPayments: { count: pending.length, value: sum(pending) },
    signupsByDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
  };
}
