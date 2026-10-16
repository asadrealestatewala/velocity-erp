import Link from "next/link";
import {
  AlarmClock, Bike, CheckCircle2, CircleDollarSign, FileClock, Inbox, Store, UserPlus, Users, UserX, XCircle, Target, Sparkles, Building2,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage, leadScope, contactScope, testDriveScope, taskScope } from "@/server/authz";
import { getCharts, getDealershipPerformance, getKpis, parseRange } from "@/server/services/analytics";
import { lookups, opt } from "@/server/lookups";
import { PageHeader, StatCard, Card, CardHeader, Avatar, Badge, EmptyState } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { BarList, SplitBar, TrendChart } from "@/components/charts/charts";
import { fmtDateTime, fmtMoney, fmtNumber, fmtRelative, fullName } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/server/services/activity";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("dashboard.view");
  const { flat } = parseListParams(await searchParams);
  const range = parseRange(flat, 30);
  const f = { ...range, cityId: flat.city, dealershipId: flat.dealership, sourceId: flat.source, stageId: flat.stage, ownerId: flat.owner };
  const scope = leadScope(user);
  const [kpi, charts, perf, lk, staff, recent, followUps, unassigned] = await Promise.all([
    getKpis(scope, f, { central: true, contactScope: contactScope(user), testDriveScope: testDriveScope(user) }),
    getCharts(scope, f, testDriveScope(user)),
    getDealershipPerformance(f),
    lookups(),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.activity.findMany({
      where: { lead: scope },
      orderBy: { occurredAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.task.findMany({
      where: { AND: [taskScope(user), { status: { in: ["OPEN", "IN_PROGRESS"] } }, { dueAt: { lte: new Date(Date.now() + 7 * 86400_000) } }] },
      orderBy: { dueAt: "asc" },
      take: 8,
      include: { contact: { select: { id: true, firstName: true, lastName: true } }, assignedTo: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { AND: [scope, { dealershipId: null, isArchived: false, stage: { kind: "OPEN" } }] },
      orderBy: { createdAt: "asc" },
      take: 6,
      include: { contact: { select: { id: true, firstName: true, lastName: true, phone: true } }, city: { select: { name: true } }, source: { select: { name: true } } },
    }),
  ]);

  const q = (p: Record<string, string>) => `/crm/contacts?${new URLSearchParams(p).toString()}`;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`Network performance from ${range.from.toLocaleDateString("en-GB")} to ${range.to.toLocaleDateString("en-GB")} · compared with the previous period of equal length`}
      />
      <FilterBar
        filters={[
          { type: "daterange", from: "from", to: "to", label: "Period", presets: true },
          { type: "select", name: "city", label: "All cities", options: opt(lk.cities) },
          { type: "select", name: "dealership", label: "All dealerships", options: opt(lk.dealerships) },
          { type: "select", name: "source", label: "All sources", options: opt(lk.sources) },
          { type: "select", name: "stage", label: "All stages", options: opt(lk.stages) },
          { type: "select", name: "owner", label: "Any employee", options: opt(staff) },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total contacts" value={fmtNumber(kpi.totalContacts)} icon={Users} delta={kpi.contactsDelta === null ? null : { value: kpi.contactsDelta }} hint={`+${kpi.newContacts} new`} href="/crm/contacts" />
        <StatCard label="Leads in period" value={fmtNumber(kpi.leadsInPeriod)} icon={UserPlus} tone="blue" delta={kpi.leadsDelta === null ? null : { value: kpi.leadsDelta }} hint={`${fmtNumber(kpi.totalLeads)} total`} />
        <StatCard label="New leads today" value={kpi.newToday} icon={Sparkles} tone="violet" />
        <StatCard label="Need follow-up" value={kpi.followUp} icon={AlarmClock} tone="amber" hint="due today or overdue" href={q({ followUp: "due" })} />
        <StatCard label="Unassigned leads" value={kpi.unassigned} icon={UserX} tone="red" hint="awaiting assignment" href={q({ assigned: "no" })} />
        <StatCard label="Assigned to dealers" value={kpi.assigned} icon={Building2} tone="gray" hint="open leads" href={q({ assigned: "yes" })} />
        <StatCard label="Test drives scheduled" value={kpi.tdScheduled} icon={Bike} tone="blue" hint="upcoming" href="/crm/test-drives" />
        <StatCard label="Test drives completed" value={kpi.tdCompleted} icon={CheckCircle2} tone="green" delta={kpi.tdCompletedDelta === null ? null : { value: kpi.tdCompletedDelta }} />
        <StatCard label="Converted customers" value={kpi.converted} icon={Target} tone="green" delta={kpi.convertedDelta === null ? null : { value: kpi.convertedDelta }} hint={`${kpi.conversionRate}% cohort rate`} />
        <StatCard label="Lost leads" value={kpi.lost} icon={XCircle} tone="red" delta={kpi.lostDelta === null ? null : { value: kpi.lostDelta, goodWhenUp: false }} />
        <StatCard label="Pending applications" value={kpi.pendingApps} icon={FileClock} tone="violet" href="/crm/applications" />
        <StatCard label="Active dealerships" value={kpi.activeDealers} icon={Store} tone="gray" href="/crm/dealerships" />
        <StatCard label="Recognised sales" value={fmtMoney(kpi.salesRevenue)} icon={CircleDollarSign} tone="green" delta={kpi.salesDelta === null ? null : { value: kpi.salesDelta }} hint="converted lead values" />
        <StatCard label="Recorded payments" value={fmtMoney(kpi.recordedPayments)} icon={CircleDollarSign} tone="gray" hint="manually entered, unverified" />
        <StatCard label="Lead → customer" value={`${kpi.conversionRate}%`} icon={Target} tone="brand" hint="of leads created in period" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Lead creation trend" description={`Leads created and converted per ${charts.bucket}`} />
          <div className="p-5">
            <TrendChart data={charts.trend} series={[{ key: "leads", label: "Leads created" }, { key: "converted", label: "Since converted" }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Leads by stage" description="Current pipeline (all open & closed)" action={<Link href="/crm/pipeline" className="text-xs font-medium text-brand-600 hover:underline">Pipeline →</Link>} />
          <div className="p-5">
            <BarList data={charts.byStage.map((s) => ({ name: s.name, value: s.value, color: s.color }))} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Leads by source" />
          <div className="p-5"><BarList data={charts.bySource} /></div>
        </Card>
        <Card>
          <CardHeader title="Leads by city" />
          <div className="p-5"><BarList data={charts.byCity} /></div>
        </Card>
        <Card>
          <CardHeader title="Leads by dealership" />
          <div className="p-5"><BarList data={charts.byDealership} /></div>
        </Card>
        <Card>
          <CardHeader title="Lead origin" description="Company-assigned vs dealership walk-in" />
          <div className="p-5">
            <SplitBar parts={charts.byOrigin} />
            <div className="mt-6 border-t border-ink-100 pt-4">
              <p className="mb-2 text-xs font-semibold text-ink-500 uppercase">Top loss reasons</p>
              <BarList data={charts.lossReasons.slice(0, 4)} color="#868fa0" empty="No lost leads in period" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Test-drive bookings" description="Requested vs completed" />
          <div className="p-5">
            <TrendChart data={charts.trend} series={[{ key: "tdBooked", label: "Booked" }, { key: "tdCompleted", label: "Completed" }]} height={220} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Unassigned — needs attention" action={<Link href={q({ assigned: "no" })} className="text-xs font-medium text-brand-600 hover:underline">View all →</Link>} />
          {unassigned.length ? (
            <ul className="divide-y divide-ink-100">
              {unassigned.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={fullName(l.contact)} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/crm/contacts/${l.contact.id}`} className="link block truncate text-sm">{fullName(l.contact)}</Link>
                    <p className="truncate text-xs text-ink-500">{l.city?.name ?? "No city"} · {l.source?.name ?? "—"} · {fmtRelative(l.createdAt)}</p>
                  </div>
                  <Badge tone="red">Unassigned</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Inbox} title="All leads are assigned" description="New unrouted leads will appear here." />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Dealership performance" description="Normalised rates for the selected period — compare outlets of different sizes fairly" action={<Link href="/crm/reports" className="text-xs font-medium text-brand-600 hover:underline">Full report →</Link>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-ink-50/60">
              <tr>
                <th className="th">Dealership</th><th className="th text-right">Leads</th><th className="th text-right">Converted</th>
                <th className="th text-right">Conv. rate</th><th className="th text-right">Test drives done</th><th className="th text-right">TD completion</th>
                <th className="th text-right">Avg. response</th><th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {perf.map((d) => (
                <tr key={d.id} className="hover:bg-ink-50/50">
                  <td className="td"><Link href={`/crm/dealerships/${d.id}`} className="link">{d.name}</Link><span className="ml-2 text-xs text-ink-400">{d.city}</span></td>
                  <td className="td text-right tabular-nums">{d.leads}</td>
                  <td className="td text-right tabular-nums">{d.converted}</td>
                  <td className="td text-right font-semibold tabular-nums">{d.conversionRate}%</td>
                  <td className="td text-right tabular-nums">{d.testDrivesCompleted}</td>
                  <td className="td text-right tabular-nums">{d.testDriveCompletionRate}%</td>
                  <td className="td text-right tabular-nums">{d.avgResponseHours === null ? "—" : `${d.avgResponseHours} h`}</td>
                  <td className="td text-right tabular-nums">{fmtMoney(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-ink-100">
            {recent.map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-ink-800">
                    <span className="font-medium">{ACTIVITY_LABELS[a.type]}</span>
                    {a.contact && (
                      <> · <Link href={`/crm/contacts/${a.contact.id}`} className="link">{fullName(a.contact)}</Link></>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-500">{a.title} · {a.user?.name ?? "System"} · {fmtRelative(a.occurredAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Upcoming follow-ups" description="Next 7 days, including overdue" action={<Link href="/crm/tasks" className="text-xs font-medium text-brand-600 hover:underline">All tasks →</Link>} />
          {followUps.length ? (
            <ul className="divide-y divide-ink-100">
              {followUps.map((t) => {
                const overdue = t.dueAt < new Date();
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <AlarmClock className={overdue ? "h-4 w-4 text-red-500" : "h-4 w-4 text-ink-400"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-800">{t.title}</p>
                      <p className="truncate text-xs text-ink-500">
                        {t.contact ? <Link href={`/crm/contacts/${t.contact.id}`} className="hover:underline">{fullName(t.contact)}</Link> : "—"} · {t.assignedTo.name}
                      </p>
                    </div>
                    <span className={overdue ? "text-xs font-semibold text-red-600" : "text-xs text-ink-500"}>{overdue ? "Overdue · " : ""}{fmtDateTime(t.dueAt)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={AlarmClock} title="No follow-ups due" />
          )}
        </Card>
      </div>
    </>
  );
}
