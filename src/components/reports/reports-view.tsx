import { Download } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral, leadScope, taskScope, testDriveScope } from "@/server/authz";
import { getCharts, getDealershipPerformance, getKpis, getOpsMetrics, parseRange } from "@/server/services/analytics";
import { getSettings } from "@/server/settings";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { BarList, SplitBar, TrendChart } from "@/components/charts/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { fmtMoney } from "@/lib/utils";
import { APPLICATION_STATUS } from "@/lib/constants";

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-100 p-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}

export async function ReportsView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const central = isCentral(user);
  const range = parseRange(params, 30);
  const f = { ...range, cityId: params.city, dealershipId: params.dealership, sourceId: params.source, stageId: params.stage, ownerId: params.rep };
  const scope = leadScope(user);
  const ids = central ? undefined : dealershipIds(user);
  const settings = await getSettings();
  const [lk, kpi, charts, ops, perf, apps, reps, tdStatus] = await Promise.all([
    lookups(),
    getKpis(scope, f, { central, contactScope: central ? {} : { leads: { some: scope } }, testDriveScope: testDriveScope(user), dealershipIds: ids }),
    getCharts(scope, f, testDriveScope(user)),
    getOpsMetrics(scope, f, taskScope(user), settings.gamification.responseWindowHours),
    getDealershipPerformance(f, ids),
    central ? db.dealershipApplication.groupBy({ by: ["status"], _count: { _all: true } }) : Promise.resolve([]),
    db.user.findMany({ where: { isActive: true, role: { scope: "DEALERSHIP" }, ...(ids ? { memberships: { some: { dealershipId: { in: ids } } } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.testDriveBooking.groupBy({ by: ["status"], where: { AND: [testDriveScope(user), { scheduledAt: { gte: range.from, lte: range.to } }, params.dealership ? { dealershipId: params.dealership } : {}] }, _count: { _all: true } }),
  ]);
  const tdDue = tdStatus.filter((s) => s.status !== "CANCELLED").reduce((a, s) => a + s._count._all, 0);
  const tdDone = tdStatus.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
  const exportQs = new URLSearchParams(Object.entries({ from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), city: params.city ?? "" }).filter(([, v]) => v)).toString();

  return (
    <>
      <PageHeader
        title={central ? "Reports & analytics" : "Dealership analytics"}
        description={`${range.from.toLocaleDateString("en-GB")} – ${range.to.toLocaleDateString("en-GB")} · all figures calculated from recorded data`}
        actions={can(user, "reports.view") ? (
          <a href={`/api/export/performance?${exportQs}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium hover:bg-ink-50"><Download className="h-4 w-4" /> Export performance CSV</a>
        ) : undefined}
      />
      <FilterBar
        filters={[
          { type: "daterange", from: "from", to: "to", label: "Period", presets: true },
          ...(central ? [{ type: "select" as const, name: "city", label: "All cities", options: opt(lk.cities) }, { type: "select" as const, name: "dealership", label: "All dealerships", options: opt(lk.dealerships) }] : []),
          { type: "select", name: "source", label: "All sources", options: opt(lk.sources) },
          { type: "select", name: "stage", label: "All stages", options: opt(lk.stages) },
          { type: "select", name: "rep", label: "All salespeople", options: opt(reps) },
        ]}
      />

      <Card>
        <CardHeader title="Headline metrics" description="Definitions: conversion = leads created in the period that are now converted ÷ leads created. Revenue = conversion values on converted leads; payments are manually recorded and unverified." />
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 xl:grid-cols-6">
          <Metric label="Leads created" value={kpi.leadsInPeriod} />
          <Metric label="Lead → customer" value={`${kpi.conversionRate}%`} hint="cohort conversion" />
          <Metric label="Converted (in period)" value={kpi.converted} />
          <Metric label="Lost (in period)" value={kpi.lost} />
          <Metric label="Recognised sales" value={fmtMoney(kpi.salesRevenue)} hint="converted lead values" />
          <Metric label="Recorded payments" value={fmtMoney(kpi.recordedPayments)} hint="status PAID, unverified" />
          <Metric label="Avg. first response" value={ops.avgResponseHours === null ? "—" : `${ops.avgResponseHours} h`} hint={`median ${ops.medianResponseHours ?? "—"} h`} />
          <Metric label={`Responded ≤ ${settings.gamification.responseWindowHours} h`} value={`${ops.withinWindowPct}%`} hint={`${ops.respondedPct}% contacted at all`} />
          <Metric label="Follow-ups on time" value={`${ops.followUpsOnTimePct}%`} hint={`${ops.followUpsDue} due · ${ops.followUpsLate} late · ${ops.followUpsMissed} open/missed`} />
          <Metric label="Test drives booked" value={kpi.tdCreated} />
          <Metric label="Test-drive completion" value={`${tdDue ? Math.round((tdDone / tdDue) * 100) : 0}%`} hint={`${tdDone} of ${tdDue} scheduled in period`} />
          <Metric label="Upcoming test drives" value={kpi.tdScheduled} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Leads created over time" /><div className="p-5"><TrendChart data={charts.trend} series={[{ key: "leads", label: "Leads" }, { key: "converted", label: "Since converted" }]} /></div></Card>
        <Card><CardHeader title="Test-drive bookings & completion" /><div className="p-5"><TrendChart data={charts.trend} series={[{ key: "tdBooked", label: "Booked" }, { key: "tdCompleted", label: "Completed" }]} /></div></Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardHeader title="Leads by source" /><div className="p-5"><BarList data={charts.bySource} /></div></Card>
        <Card><CardHeader title="Leads by stage" description="Current position" /><div className="p-5"><BarList data={charts.byStage.map((s) => ({ name: s.name, value: s.value, color: s.color }))} /></div></Card>
        <Card><CardHeader title="Company-assigned vs walk-in" /><div className="p-5"><SplitBar parts={charts.byOrigin} /></div></Card>
        <Card><CardHeader title="Leads by city" /><div className="p-5"><BarList data={charts.byCity} /></div></Card>
        {central && <Card><CardHeader title="Leads by dealership" /><div className="p-5"><BarList data={charts.byDealership} /></div></Card>}
        <Card><CardHeader title="Loss reasons" /><div className="p-5"><BarList data={charts.lossReasons} color="#868fa0" empty="No lost leads in this period" /></div></Card>
        {central && (
          <Card>
            <CardHeader title="Dealership applications" description="All time, by status" />
            <div className="p-5"><BarList data={Object.entries(APPLICATION_STATUS).map(([k, v]) => ({ name: v.label, value: apps.find((a) => a.status === k)?._count._all ?? 0 }))} color="#8b5cf6" /></div>
          </Card>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader title={central ? "Dealership activity & performance" : "Your outlet performance"} description="Normalised rates allow fair comparison across outlets of different size" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-ink-50/60">
              <tr><th className="th">Dealership</th><th className="th">City</th><th className="th text-right">Leads</th><th className="th text-right">Converted</th><th className="th text-right">Conv. rate</th><th className="th text-right">Test drives</th><th className="th text-right">TD completion</th><th className="th text-right">Avg response</th><th className="th text-right">Points</th><th className="th text-right">Revenue</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {perf.map((d) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.name}</td><td className="td">{d.city}</td>
                  <td className="td text-right tabular-nums">{d.leads}</td><td className="td text-right tabular-nums">{d.converted}</td>
                  <td className="td text-right font-semibold tabular-nums">{d.conversionRate}%</td><td className="td text-right tabular-nums">{d.testDrivesCompleted}</td>
                  <td className="td text-right tabular-nums">{d.testDriveCompletionRate}%</td><td className="td text-right tabular-nums">{d.avgResponseHours === null ? "—" : `${d.avgResponseHours} h`}</td>
                  <td className="td text-right tabular-nums">{d.points}</td><td className="td text-right tabular-nums">{fmtMoney(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-ink-400">Report links: <a className="text-brand-600 hover:underline" href={`${base}/contacts`}>contacts</a> · <a className="text-brand-600 hover:underline" href={`${base}/test-drives`}>test drives</a> · <a className="text-brand-600 hover:underline" href={`${base}/leaderboard`}>leaderboard</a></p>
    </>
  );
}
