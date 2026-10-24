import { Building2, Eye, TrendingUp, Percent, UserMinus, Repeat, Banknote, Scale, UserPlus } from "lucide-react";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui/misc";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { getMetrics, type ByCurrency } from "@/server/platform/metrics";
import { fmtMoney } from "@/lib/utils";
import { platformDb } from "@/server/platform/client";

export const metadata = { title: "Overview" };

const money = (m: ByCurrency) => (Object.keys(m).length ? Object.entries(m).map(([c, v]) => fmtMoney(v, c)).join(" · ") : "—");
const RANGES = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string; denied?: string }> }) {
  const admin = await requireAdminPage("dashboard");
  const sp = await searchParams;
  const days = RANGES[(sp.range ?? "30") as keyof typeof RANGES] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const m = await getMetrics(from, to);
  const showMoney = adminCan(admin.role, "reports");
  const visits = await platformDb().pageView.groupBy({ by: ["path"], where: { day: { gte: new Date(from.toISOString().slice(0, 10)) } }, _sum: { count: true } });
  const totalVisits = visits.reduce((n, v) => n + (v._sum.count ?? 0), 0);
  return (
    <>
      <PageHeader title="Overview" description={`Real figures from the last ${days} days. The original workspace is not counted as a customer.`} />
      {sp.denied && <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Your platform role does not include that page.</p>}
      <div className="mb-4 flex gap-2 text-sm">
        {Object.keys(RANGES).map((r) => (
          <a key={r} href={`/platform?range=${r}`} className={`rounded-lg px-3 py-1.5 ${String(days) === r ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{r} days</a>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workspaces" icon={Building2} value={String(m.workspaces.total)} />
        <StatCard label="New signups" icon={UserPlus} value={String(m.signups)} />
        <StatCard label="Trial conversion" icon={Percent} value={m.trial.rate === null ? "—" : `${m.trial.rate}%`} />
        <StatCard label="Churned" icon={UserMinus} tone="red" value={String(m.churned)} />
        <StatCard label="Website visits" icon={Eye} hint="Aggregate, no tracking" value={String(totalVisits)} />
        {showMoney && <StatCard label="MRR" icon={Repeat} value={<span className="text-xl">{money(m.mrr)}</span>} />}
        {showMoney && <StatCard label="ARR run-rate" icon={TrendingUp} value={<span className="text-xl">{money(m.arr)}</span>} />}
        {showMoney && <StatCard label="Collected" icon={Banknote} value={<span className="text-xl">{money(m.collected)}</span>} />}
        {showMoney && <StatCard label="Net of refunds" icon={Scale} value={<span className="text-xl">{money(m.net)}</span>} />}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscriptions" />
          <ul className="divide-y divide-slate-100 text-sm">
            {Object.entries(m.workspaces.bySubscription).map(([k, v]) => <li key={k} className="flex justify-between py-2"><span>{k.toLowerCase().replace("_", " ")}</span><span className="font-semibold">{v}</span></li>)}
            {!Object.keys(m.workspaces.bySubscription).length && <li className="py-2 text-slate-500">No customer workspaces yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Needs attention" />
          <ul className="space-y-2 text-sm">
            <li>Payments awaiting confirmation: <strong>{m.pendingPayments.count}</strong>{m.pendingPayments.count ? ` (${money(m.pendingPayments.value)})` : ""} — <a className="link text-brand-600" href="/platform/payments">review</a></li>
            {showMoney && <li>Revenue at risk (past due): <strong>{money(m.mrrAtRisk)}</strong></li>}
            <li>Trials ending in period: <strong>{m.trial.ended}</strong> · converted: <strong>{m.trial.converted}</strong></li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">MRR counts active subscriptions only (yearly ÷ 12). ARR is MRR × 12, a run-rate and not recognised revenue.</p>
        </Card>
      </div>
    </>
  );
}
