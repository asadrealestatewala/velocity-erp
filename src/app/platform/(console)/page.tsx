import Link from "next/link";
import { Eye, Hourglass, UserPlus } from "lucide-react";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { getMetrics, type ByCurrency } from "@/server/platform/metrics";
import { platformDb } from "@/server/platform/client";
import { fmtMoney } from "@/lib/utils";

export const metadata = { title: "Overview" };

const money = (m: ByCurrency) => (Object.keys(m).length ? Object.entries(m).map(([c, v]) => fmtMoney(v, c)).join(" · ") : "—");
const RANGES = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#ef5a77" },
  TRIALING: { label: "Free trial", color: "#f6c445" },
  PAST_DUE: { label: "Past due", color: "#fb923c" },
  PENDING: { label: "No plan yet", color: "#9ca3af" },
  EXPIRED: { label: "Expired", color: "#0f1220" },
  CANCELED: { label: "Cancelled", color: "#cbd5e1" },
  SUSPENDED: { label: "Suspended", color: "#7c3aed" },
};

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

  // Last up-to-14 days of signups, zero-filled, for the bar chart.
  const span = Math.min(days, 14);
  const byDay = new Map(m.signupsByDay.map((d) => [d.day, d.count]));
  const bars = Array.from({ length: span }, (_, i) => {
    const d = new Date(to.getTime() - (span - 1 - i) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString("en-GB", { weekday: "narrow" }), count: byDay.get(key) ?? 0 };
  });
  const maxBar = Math.max(1, ...bars.map((b) => b.count));
  const peak = bars.reduce((a, b) => (b.count > a.count ? b : a), bars[0]!);

  const subs = Object.entries(m.workspaces.bySubscription).sort((a, b) => b[1] - a[1]);
  const total = m.workspaces.total;
  let acc = 0;
  const conic = total ? subs.map(([k, v]) => { const s = (acc / total) * 100; acc += v; return `${STATUS[k]?.color ?? "#999"} ${s}% ${(acc / total) * 100}%`; }).join(", ") : "#e3dfdb 0 100%";
  const active = m.workspaces.bySubscription.ACTIVE ?? 0;
  const trialing = m.workspaces.bySubscription.TRIALING ?? 0;
  const pastDue = m.workspaces.bySubscription.PAST_DUE ?? 0;

  const rows: [string, string][] = showMoney
    ? [["Collected", money(m.collected)], ["Invoiced", money(m.invoiced)], ["Refunds", money(m.refunds)], ["Net of refunds", money(m.net)], ["ARR run-rate", money(m.arr)], ["Revenue at risk (past due)", money(m.mrrAtRisk)]]
    : [["Trials ending in period", String(m.trial.ended)], ["Converted", String(m.trial.converted)]];
  rows.push(["Churned in period", String(m.churned)], ["Payments awaiting confirmation", `${m.pendingPayments.count}${m.pendingPayments.count ? ` (${money(m.pendingPayments.value)})` : ""}`]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Overview</h1>
          <p className="mt-1 text-sm text-ink-500">Real figures from the last {days} days. The original workspace is not counted as a customer.</p>
        </div>
        {adminCan(admin.role, "payments.manage") && (
          <Link href="/platform/payments" className="inline-flex items-center gap-2 rounded-full bg-[#0f1220] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2036]">
            Payments{m.pendingPayments.count ? <span className="rounded-full bg-pink-500 px-2 py-0.5 text-xs">{m.pendingPayments.count}</span> : null}
          </Link>
        )}
      </div>
      {sp.denied && <p role="alert" className="mb-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900">Your platform role does not include that page.</p>}

      <nav aria-label="Time range" className="mb-5 flex gap-6 border-b border-black/10 text-sm">
        {Object.keys(RANGES).map((r) => (
          <Link key={r} href={`/platform?range=${r}`} aria-current={String(days) === r ? "page" : undefined} className={`-mb-px border-b-2 pb-2.5 font-semibold ${String(days) === r ? "border-[#0f1220] text-[#0f1220]" : "border-transparent text-ink-500 hover:text-ink-900"}`}>{r} days</Link>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr_0.85fr]">
        {/* Hero metric */}
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-400 via-rose-500 to-pink-500 p-6 text-white shadow-xl shadow-pink-500/20">
          <p className="text-sm font-medium opacity-90">{showMoney ? "Monthly recurring revenue" : "Workspaces"}</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight">{showMoney ? money(m.mrr) : total}</p>
          <svg viewBox="0 0 300 70" className="mt-4 h-16 w-full" role="img" aria-label={`Signups per day, last ${span} days`}>
            <polyline fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={bars.map((b, i) => `${(i / Math.max(1, bars.length - 1)) * 296 + 2},${66 - (b.count / maxBar) * 56}`).join(" ")} />
          </svg>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-white/30 text-center">
            {[["Active", active], ["Trialing", trialing], ["Past due", pastDue]].map(([k, v]) => (
              <div key={k as string} className="px-2"><dt className="text-xs opacity-80">{k}</dt><dd className="mt-1 text-2xl font-bold">{v}</dd></div>
            ))}
          </dl>
        </section>

        {/* Donut */}
        <section className="rounded-[2rem] bg-[#f6f4f2] p-6">
          <h2 className="text-sm font-semibold text-ink-900">Subscriptions</h2>
          <div className="mt-4 flex items-center gap-5">
            <div role="img" aria-label={`${total} workspaces: ${subs.map(([k, v]) => `${STATUS[k]?.label ?? k} ${v}`).join(", ") || "none yet"}`} className="relative size-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${conic})` }}>
              <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[#f6f4f2]">
                <span className="text-3xl font-extrabold">{total}</span>
                <span className="text-[11px] text-ink-500">workspaces</span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2 text-sm">
              {subs.map(([k, v]) => (
                <li key={k} className="flex items-center gap-2"><span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS[k]?.color }} /><span className="truncate text-ink-600">{STATUS[k]?.label ?? k}</span><span className="ml-auto font-semibold tabular-nums">{v}</span></li>
              ))}
              {!subs.length && <li className="text-ink-500">No customer workspaces yet.</li>}
            </ul>
          </div>
        </section>

        {/* Small tiles */}
        <div className="grid gap-5">
          {[
            { icon: UserPlus, label: "New signups", value: String(m.signups), bar: Math.min(100, (m.signups / Math.max(1, days / 3)) * 100), dark: false },
            { icon: Hourglass, label: "Trial conversion", value: m.trial.rate === null ? "—" : `${m.trial.rate}%`, bar: m.trial.rate ?? 0, dark: false },
            { icon: Eye, label: "Website visits", value: String(totalVisits), bar: Math.min(100, totalVisits), dark: true },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-4 rounded-[2rem] bg-[#f6f4f2] p-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#f3d4cf]"><t.icon className="size-5 text-[#0f1220]" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between text-sm font-semibold"><span>{t.label}</span><span className="text-xl font-extrabold tabular-nums">{t.value}</span></p>
                <div className="mt-2 h-2 rounded-full bg-white" role="presentation"><div className={`h-2 rounded-full ${t.dark ? "bg-[#0f1220]" : "bg-gradient-to-r from-orange-400 to-pink-500"}`} style={{ width: `${Math.max(4, t.bar)}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-[2rem] bg-[#f6f4f2] p-6">
          <h2 className="text-sm font-semibold">{showMoney ? "Money and attention" : "Attention"}</h2>
          <ul className="mt-3 space-y-2">
            {rows.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm"><span className="text-ink-600">{k}</span><span className="font-bold tabular-nums">{v}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">MRR counts active subscriptions only (yearly ÷ 12). ARR is MRR × 12, a run-rate and not recognised revenue.</p>
        </section>

        <section className="rounded-[2rem] bg-[#f6f4f2] p-6">
          <h2 className="text-sm font-semibold">Signups, last {span} days</h2>
          <div role="img" aria-label={`Signups per day: ${bars.map((b) => `${b.key} ${b.count}`).join(", ")}`} className="mt-6 flex h-44 items-end gap-2">
            {bars.map((b) => {
              const isPeak = b.count > 0 && b.key === peak.key;
              return (
                <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${b.key}: ${b.count}`}>
                  <div className={`w-full rounded-full ${isPeak ? "bg-gradient-to-t from-orange-400 to-pink-500" : "bg-[#d3cfca]"}`} style={{ height: `${Math.max(6, (b.count / maxBar) * 100)}%` }} />
                  <span className="text-[10px] text-ink-500">{b.label}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm"><span className="text-ink-600">Signups in period</span><span className="font-bold">{m.signups}</span></p>
        </section>
      </div>
    </>
  );
}
