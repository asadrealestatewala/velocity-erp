import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { getMetricsCached, type ByCurrency } from "@/server/platform/metrics";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime, fmtMoney } from "@/lib/utils";

export const metadata = { title: { absolute: "Overview · Velocity console" } };

const money = (m: ByCurrency) => (Object.keys(m).length ? Object.entries(m).map(([c, v]) => fmtMoney(v, c)).join(" · ") : "—");
const RANGES = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#059669" },
  TRIALING: { label: "Free trial", color: "#d97706" },
  PAST_DUE: { label: "Past due", color: "#dc2626" },
  PENDING: { label: "No plan yet", color: "#9ca3af" },
  EXPIRED: { label: "Expired", color: "#6b7280" },
  CANCELED: { label: "Cancelled", color: "#c4c4cc" },
  SUSPENDED: { label: "Suspended", color: "#7c3aed" },
};

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string; denied?: string }> }) {
  const admin = await requireAdminPage("dashboard");
  const sp = await searchParams;
  const days = RANGES[(sp.range ?? "30") as keyof typeof RANGES] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  // Independent queries run together; the metrics function itself runs its own queries in parallel too.
  const [m, visits, openTickets, activity] = await Promise.all([
    getMetricsCached(days),
    platformDb().pageView.aggregate({ where: { day: { gte: new Date(from.toISOString().slice(0, 10)) } }, _sum: { count: true } }),
    adminCan(admin.role, "support.manage") ? platformDb().supportTicket.count({ where: { status: "OPEN" } }) : Promise.resolve(null),
    adminCan(admin.role, "audit.view") ? platformDb().platformAudit.findMany({ orderBy: { at: "desc" }, take: 8, select: { id: true, at: true, adminEmail: true, action: true, targetType: true, targetId: true } }) : Promise.resolve(null),
  ]);
  const showMoney = adminCan(admin.role, "reports");
  const totalVisits = visits._sum.count ?? 0;

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
  const conic = total ? subs.map(([k, v]) => { const s = (acc / total) * 100; acc += v; return `${STATUS[k]?.color ?? "#999"} ${s}% ${(acc / total) * 100}%`; }).join(", ") : "var(--pf-border) 0 100%";
  const active = m.workspaces.bySubscription.ACTIVE ?? 0;
  const trialing = m.workspaces.bySubscription.TRIALING ?? 0;
  const pastDue = m.workspaces.bySubscription.PAST_DUE ?? 0;

  const rows: [string, string][] = showMoney
    ? [["Collected", money(m.collected)], ["Invoiced", money(m.invoiced)], ["Refunds", money(m.refunds)], ["Net of refunds", money(m.net)], ["ARR run-rate", money(m.arr)], ["Revenue at risk (past due)", money(m.mrrAtRisk)]]
    : [["Trials ending in period", String(m.trial.ended)], ["Converted", String(m.trial.converted)]];
  rows.push(["Churned in period", String(m.churned)], ["Payments awaiting confirmation", `${m.pendingPayments.count}${m.pendingPayments.count ? ` (${money(m.pendingPayments.value)})` : ""}`]);

  const attention = [
    m.pendingPayments.count ? { tone: "#d97706", title: `${m.pendingPayments.count} payment${m.pendingPayments.count === 1 ? "" : "s"} awaiting confirmation`, text: `${money(m.pendingPayments.value)} is waiting for someone to confirm it.`, href: "/platform/payments", show: adminCan(admin.role, "payments.manage") } : null,
    pastDue ? { tone: "#dc2626", title: `${pastDue} workspace${pastDue === 1 ? " is" : "s are"} past due`, text: showMoney ? `${money(m.mrrAtRisk)} a month is at risk.` : "Their renewal has not been paid.", href: "/platform/workspaces?sub=PAST_DUE", show: adminCan(admin.role, "tenants.view") } : null,
    openTickets ? { tone: "#2563eb", title: `${openTickets} open support ticket${openTickets === 1 ? "" : "s"}`, text: "Customers are waiting for a reply.", href: "/platform/support", show: true } : null,
  ].filter((a): a is NonNullable<typeof a> => !!a && a.show);

  const kpis: [string, string, string][] = [
    [showMoney ? "Monthly recurring revenue" : "Workspaces", showMoney ? money(m.mrr) : String(total), showMoney ? "Active subscriptions only; yearly plans ÷ 12" : "Excluding the original workspace"],
    ["Active", String(active), "Paying and in good standing"],
    ["Free trial", String(trialing), m.trial.rate === null ? "No trials have ended yet" : `${m.trial.rate}% of finished trials converted`],
    ["Past due", String(pastDue), pastDue ? "Needs a follow-up" : "Nothing overdue"],
    ["New signups", String(m.signups), `In the last ${days} days`],
    ["Website visits", String(totalVisits), `In the last ${days} days`],
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Real figures from the last ${days} days. The original workspace is not counted as a customer.`}
        actions={
          <nav aria-label="Time range" className="inline-flex rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] p-0.5 text-[13px]">
            {Object.keys(RANGES).map((r) => (
              <Link key={r} href={`/platform?range=${r}`} aria-current={String(days) === r ? "page" : undefined} className={`rounded-md px-3 py-1 font-medium ${String(days) === r ? "bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]" : "text-[var(--pf-muted)] hover:text-[var(--pf-text)]"}`}>{r} days</Link>
            ))}
          </nav>
        }
      />
      {sp.denied && <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your platform role does not include that page.</p>}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([k, v, hint]) => (
          <div key={k} className="card p-4">
            <dt className="text-[12.5px] text-[var(--pf-muted)]">{k}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
            <dd className="mt-1 text-xs text-[var(--pf-muted)]">{hint}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card" aria-labelledby="pf-attn">
          <h2 id="pf-attn" className="border-b border-[var(--pf-border)] px-4 py-3 text-sm font-semibold">Needs attention</h2>
          {attention.length ? (
            <ul className="divide-y divide-[var(--pf-border)]">
              {attention.map((a) => (
                <li key={a.title}>
                  <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--pf-sunken)]">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: a.tone }} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.title}</span><span className="block text-xs text-[var(--pf-muted)]">{a.text}</span></span>
                    <span className="flex items-center text-[13px] text-[var(--pf-accent)]">Open<ChevronRight className="size-4" aria-hidden /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[var(--pf-muted)]">All clear. No overdue payments, unconfirmed payments or waiting tickets.</p>
          )}
        </section>

        <section className="card" aria-labelledby="pf-act">
          <div className="flex items-center justify-between border-b border-[var(--pf-border)] px-4 py-3"><h2 id="pf-act" className="text-sm font-semibold">Recent platform activity</h2>{activity && <Link href="/platform/audit" className="text-[13px] text-[var(--pf-accent)] hover:underline">Audit log</Link>}</div>
          {activity === null ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--pf-muted)]">Your role does not include the audit log.</p>
          ) : activity.length ? (
            <ul className="divide-y divide-[var(--pf-border)]">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 truncate"><span className="font-medium">{a.adminEmail ?? "System"}</span> <span className="text-[var(--pf-muted)]">· <span className="font-mono text-xs">{a.action}</span>{a.targetType ? ` · ${a.targetType}` : ""}</span></span>
                  <time dateTime={a.at.toISOString()} className="shrink-0 text-xs text-[var(--pf-muted)]">{fmtDateTime(a.at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[var(--pf-muted)]">Nothing has happened yet.</p>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Subscriptions</h2>
          <div className="mt-3 flex items-center gap-4">
            <div role="img" aria-label={`${total} workspaces: ${subs.map(([k, v]) => `${STATUS[k]?.label ?? k} ${v}`).join(", ") || "none yet"}`} className="relative size-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${conic})` }}>
              <div className="absolute inset-[12px] flex flex-col items-center justify-center rounded-full bg-[var(--pf-surface)]"><span className="text-2xl font-semibold">{total}</span><span className="text-[11px] text-[var(--pf-muted)]">workspaces</span></div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
              {subs.map(([k, v]) => (
                <li key={k} className="flex items-center gap-2"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS[k]?.color }} /><span className="truncate text-[var(--pf-muted)]">{STATUS[k]?.label ?? k}</span><span className="ml-auto font-medium tabular-nums">{v}</span></li>
              ))}
              {!subs.length && <li className="text-[var(--pf-muted)]">No customer workspaces yet.</li>}
            </ul>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Signups, last {span} days</h2>
          <div role="img" aria-label={`Signups per day: ${bars.map((b) => `${b.key} ${b.count}`).join(", ")}`} className="mt-4 flex h-28 items-end gap-1.5">
            {bars.map((b) => (
              <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.key}: ${b.count}`}>
                <div className="w-full rounded-sm" style={{ height: `${Math.max(4, (b.count / maxBar) * 100)}%`, background: b.count > 0 && b.key === peak.key ? "var(--pf-accent)" : "var(--pf-border)" }} />
                <span className="text-[10px] text-[var(--pf-muted)]">{b.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--pf-muted)]">{m.signups} in the period · busiest day {peak.count ? `${peak.key} (${peak.count})` : "none yet"}</p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">{showMoney ? "Money" : "Trials"}</h2>
          <dl className="mt-2 divide-y divide-[var(--pf-border)] text-[13px]">
            {rows.map(([k, v]) => (<div key={k} className="flex items-center justify-between gap-3 py-1.5"><dt className="text-[var(--pf-muted)]">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>))}
          </dl>
          <p className="mt-2 text-xs text-[var(--pf-muted)]">ARR is MRR × 12: a run-rate, not recognised revenue.</p>
        </section>
      </div>
    </>
  );
}
