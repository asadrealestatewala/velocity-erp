import Link from "next/link";
import {
  AlarmClock, Bike, CheckCircle2, CircleDollarSign, FileClock, Inbox, Store, UserPlus, Users, UserX, XCircle, Target, Sparkles, Building2,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage, leadScope, contactScope, testDriveScope, taskScope } from "@/server/authz";
import { getCharts, getDealershipPerformance, getKpis, getLeaderboard, goalProgress, leadWhere, parseRange } from "@/server/services/analytics";
import { getDailyMissions, getUserProgress, getWeekActivity, levelFor, nextStreakMilestone } from "@/server/services/progress";
import { getFunnel } from "@/server/services/funnel";
import { startOfMonth } from "date-fns";
import { GoalsPanel } from "@/components/gamification/progress-panel";
import { AlertCards, FunnelCard, GamificationCard, LeaderboardCard, RemindersCard, greeting } from "@/components/dashboard/widgets";
import { LevelUp } from "@/components/dashboard/level-up";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { buildSetupChecklist } from "@/lib/setup-checklist";
import { Celebrate } from "@/components/gamification/celebrate";
import { can } from "@/server/authz";
import { BadgeGrid } from "@/components/gamification/badges";
import { lookups, opt } from "@/server/lookups";
import { PageHeader, StatCard, Card, CardHeader, Avatar, Badge, EmptyState } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { BarList, SplitBar, TrendChart } from "@/components/charts/charts";
import { fmtDateTime, fmtMoney, fmtNumber, fmtRelative, fullName } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/server/services/activity";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Dashboard" };

const q0 = (p: Record<string, string>) => `/crm/contacts?${new URLSearchParams(p).toString()}`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("dashboard.view");
  const { flat } = parseListParams(await searchParams);
  const range = parseRange(flat, 30);
  const f = { ...range, cityId: flat.city, dealershipId: flat.dealership, sourceId: flat.source, stageId: flat.stage, ownerId: flat.owner };
  const scope = leadScope(user);
  const now = new Date();
  const [kpi, charts, perf, lk, staff, recent, followUps, unassigned, progress, goals, achievements, earned] = await Promise.all([
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
    getUserProgress(user.id),
    db.goal.findMany({
      where: { endsAt: { gte: now }, startsAt: { lte: now } },
      orderBy: { endsAt: "asc" },
      take: 8,
      include: { dealership: { select: { name: true } }, user: { select: { name: true } } },
    }),
    db.achievement.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.userAchievement.findMany({ where: { userId: user.id } }),
  ]);
  const [missionData, week, funnel, testDrives, applications, board, setupCounts] = await Promise.all([
    getDailyMissions(user.id, now),
    getWeekActivity(user.id, now),
    getFunnel(leadWhere(scope, { ...f, stageId: undefined })),
    db.testDriveBooking.findMany({
      where: { AND: [testDriveScope(user), { scheduledAt: { gte: now }, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] } }] },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { contact: { select: { id: true, firstName: true, lastName: true } }, bikeModel: { select: { name: true } } },
    }),
    can(user, "applications.review")
      ? db.dealershipApplication.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"] } }, orderBy: { createdAt: "asc" }, take: 4, select: { id: true, businessName: true, createdAt: true, status: true } })
      : Promise.resolve([]),
    getLeaderboard("rep", { from: startOfMonth(now), to: now }),
    Promise.all([
      db.contact.count({ where: { isArchived: false } }),
      db.lead.count({ where: { dealershipId: { not: null } } }),
      db.task.count(),
      db.form.count({ where: { status: "PUBLISHED" } }),
      db.user.count({ where: { isActive: true } }),
    ]).then(([contacts, dealerAssignedLeads, tasks, publishedForms, activeUsers]) => ({ contacts, dealerAssignedLeads, tasks, publishedForms, activeUsers })),
  ]);
  const setupSteps = buildSetupChecklist(setupCounts, (perm) => can(user, perm as Parameters<typeof can>[1]));
  const level = levelFor(progress.totalPoints);
  const latestBadge = earned.length ? await db.userAchievement.findFirst({ where: { userId: user.id }, orderBy: { earnedAt: "desc" }, include: { achievement: true } }) : null;
  const goalRows = await Promise.all(goals.map(async (g) => ({ g: { ...g, dealershipName: g.dealership?.name, userName: g.user?.name }, p: await goalProgress(g) })));
  const earnedMap = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));
  const q = (p: Record<string, string>) => `/crm/contacts?${new URLSearchParams(p).toString()}`;

  const alerts = [
    { label: "Unassigned leads", count: kpi.unassigned, href: q0({ assigned: "no" }), tone: "red" as const, icon: UserX, action: "Assign" },
    { label: "Follow-ups due or overdue", count: kpi.followUp, href: q0({ followUp: "due" }), tone: "amber" as const, icon: AlarmClock, action: "View" },
    ...(can(user, "applications.review") ? [{ label: "Pending dealership applications", count: kpi.pendingApps, href: "/crm/applications", tone: "violet" as const, icon: FileClock, action: "Review" }] : []),
  ];

  return (
    <>
      <PageHeader
        title={`${greeting(now)}, ${user.name.split(" ")[0]} 👋`}
        description={`Here's what's happening across your sales network · ${range.from.toLocaleDateString("en-GB")} – ${range.to.toLocaleDateString("en-GB")}, compared with the previous period of equal length`}
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

      <SetupChecklist steps={setupSteps} userId={user.id} />
      <AlertCards items={alerts} />

      <section aria-label="Key metrics" className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total contacts" value={fmtNumber(kpi.totalContacts)} icon={Users} tone="violet" delta={kpi.contactsDelta === null ? null : { value: kpi.contactsDelta }} hint={`+${kpi.newContacts} new`} href="/crm/contacts" />
        <StatCard label="Leads in period" value={fmtNumber(kpi.leadsInPeriod)} icon={UserPlus} tone="blue" delta={kpi.leadsDelta === null ? null : { value: kpi.leadsDelta }} hint={`${fmtNumber(kpi.totalLeads)} total`} />
        <StatCard label="New leads today" value={kpi.newToday} icon={Sparkles} tone="brand" />
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
      </section>

      <section aria-label="Daily goals and gamification" className="mt-6">
        <GamificationCard missions={missionData.missions} xpToday={missionData.xpToday} level={level} streak={{ days: progress.streakDays, next: nextStreakMilestone(progress.streakDays) }} week={week} />
      </section>
      <LevelUp userId={user.id} level={level.level} />
      <Celebrate badge={latestBadge && Date.now() - latestBadge.earnedAt.getTime() < 3 * 86400_000 ? latestBadge.achievement : null} />

      <section aria-label="Pipeline and analytics" className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <FunnelCard stages={funnel.stages} total={funnel.total} lost={funnel.lost} hrefFor={(id) => q({ stage: id })} />
        </div>
        <Card className="xl:col-span-3">
          <CardHeader title="Performance overview" description={`Leads created and converted per ${charts.bucket}`} />
          <div className="p-5">
            <TrendChart data={charts.trend} series={[{ key: "leads", label: "Leads created" }, { key: "converted", label: "Since converted" }]} />
          </div>
        </Card>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Leads by stage" action={<Link href="/crm/pipeline" className="text-xs font-medium text-brand-600 hover:underline">Pipeline →</Link>} />
          <div className="p-5"><BarList data={charts.byStage.map((s) => ({ name: s.name, value: s.value, color: s.color }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Lead-source performance" />
          <div className="p-5"><BarList data={charts.bySource} /></div>
        </Card>
        <Card>
          <CardHeader title="Leads by city" />
          <div className="p-5"><BarList data={charts.byCity} /></div>
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
          <CardHeader title="Test-drive activity" description="Requested vs completed" />
          <div className="p-5">
            <TrendChart data={charts.trend} series={[{ key: "tdBooked", label: "Booked" }, { key: "tdCompleted", label: "Completed" }]} height={220} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Leads by dealership" />
          <div className="p-5"><BarList data={charts.byDealership} /></div>
        </Card>
      </div>

      <section aria-label="Reminders and activity" className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RemindersCard followUps={followUps} testDrives={testDrives} applications={applications} canReviewApplications={can(user, "applications.review")} />
        </div>
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
      </section>

      <section aria-label="Team and achievements" className="mt-4 grid gap-4 xl:grid-cols-3">
        <LeaderboardCard rows={board} period={`Dealership reps · ${now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`} />
        <Card>
          <CardHeader title="Your achievements" description={`${progress.badgesEarned} of ${progress.badgesTotal} unlocked`} action={<Link href="/crm/leaderboard" className="text-xs font-medium text-brand-600 hover:underline">Details →</Link>} />
          <div className="p-4"><BadgeGrid all={achievements} earned={earnedMap} /></div>
        </Card>
        <GoalsPanel rows={goalRows} description="Active targets — progress from recorded activity" />
      </section>

      <Card className="mt-4">
        <CardHeader title="Dealership performance" description="Normalised rates for the selected period — compare outlets of different sizes fairly" action={<Link href="/crm/reports" className="text-xs font-medium text-brand-600 hover:underline">Full report →</Link>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-ink-50/70">
              <tr>
                <th className="th">Dealership</th><th className="th text-right">Leads</th><th className="th text-right">Converted</th>
                <th className="th text-right">Conv. rate</th><th className="th text-right">Test drives done</th><th className="th text-right">TD completion</th>
                <th className="th text-right">Avg. response</th><th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {perf.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-brand-50/40">
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

      <Card className="mt-4">
        <CardHeader title="Recent activity" />
        <ul className="divide-y divide-ink-100">
          {recent.map((a) => (
            <li key={a.id} className="flex gap-3 px-5 py-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-ink-800">
                  <span className="font-medium">{ACTIVITY_LABELS[a.type]}</span>
                  {a.contact && (<> · <Link href={`/crm/contacts/${a.contact.id}`} className="link">{fullName(a.contact)}</Link></>)}
                </p>
                <p className="truncate text-xs text-ink-500">{a.title} · {a.user?.name ?? "System"} · {fmtRelative(a.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
