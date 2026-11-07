import Link from "next/link";
import { startOfMonth, subDays } from "date-fns";
import {
  AlarmClock, Bike, Boxes, Building2, CheckCircle2, CheckSquare, Flame, Footprints, PackageX, Phone, Target, Trophy, Truck, UserCheck, Users, Wallet, XCircle, Sparkles,
} from "lucide-react";
import { db } from "@/lib/db";
import { can, dealershipIds, leadScope, requirePortalPage, taskScope, testDriveScope } from "@/server/authz";
import { getKpis, goalProgress, GOAL_LABELS } from "@/server/services/analytics";
import { dealerBalance } from "@/server/services/ledger";
import { stockState } from "@/lib/ops-constants";
import { Card, CardHeader, EmptyState, ProgressBar, StatCard, Badge } from "@/components/ui/misc";
import { DashboardHero, greeting } from "@/components/dashboard/widgets";
import { GoalsPanel } from "@/components/gamification/progress-panel";
import { BadgeGrid } from "@/components/gamification/badges";
import { Celebrate } from "@/components/gamification/celebrate";
import { fmtDateTime, fmtMoney, fmtRelative, fullName } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/server/services/activity";
import { TEST_DRIVE_STATUS } from "@/lib/constants";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { buildDealerChecklist } from "@/lib/dealer-onboarding";
import { getDealerSetupCounts } from "@/server/services/dealer-setup";

export const metadata = { title: "Dealer dashboard" };

export default async function PortalDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage();
  const sp = await searchParams;
  const ids = dealershipIds(user);
  const scope = leadScope(user);
  const isManager = user.memberships.some((m) => m.role === "MANAGER");
  const now = new Date();
  const range = { from: subDays(now, 29), to: now };
  const monthStart = startOfMonth(now);

  const [kpi, byOrigin, contacted, qualified, pendingTasks, overdue, upcoming, recentAssign, team, goals, myPoints, achievements, earned, latestBadge, newLeads] = await Promise.all([
    getKpis(scope, range, { central: false, contactScope: { leads: { some: scope } }, testDriveScope: testDriveScope(user), dealershipIds: ids }),
    db.lead.groupBy({ by: ["origin"], where: { AND: [scope, { isArchived: false }] }, _count: { _all: true } }),
    db.lead.count({ where: { AND: [scope, { isArchived: false, firstContactedAt: { not: null }, stage: { kind: "OPEN" } }] } }),
    db.lead.count({ where: { AND: [scope, { isArchived: false, stage: { key: { in: ["QUALIFIED", "TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "NEGOTIATION"] } } }] } }),
    db.task.count({ where: { AND: [taskScope(user), { status: { in: ["OPEN", "IN_PROGRESS"] } }] } }),
    db.task.count({ where: { AND: [taskScope(user), { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } }] } }),
    db.testDriveBooking.findMany({ where: { AND: [testDriveScope(user), { scheduledAt: { gte: now }, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] } }] }, orderBy: { scheduledAt: "asc" }, take: 6, include: { contact: { select: { id: true, firstName: true, lastName: true } }, bikeModel: { select: { name: true } } } }),
    db.leadAssignmentHistory.findMany({ where: { toDealershipId: { in: ids }, lead: scope }, orderBy: { createdAt: "desc" }, take: 6, include: { lead: { select: { id: true, number: true, origin: true, contact: { select: { id: true, firstName: true, lastName: true } } } }, toUser: { select: { name: true } } } }),
    db.activity.findMany({ where: { dealershipId: { in: ids }, userId: { not: null }, ...(isManager ? {} : { userId: user.id }) }, orderBy: { occurredAt: "desc" }, take: 8, include: { user: { select: { name: true } }, contact: { select: { id: true, firstName: true, lastName: true } } } }),
    db.goal.findMany({ where: { OR: [{ dealershipId: { in: ids } }, { userId: user.id }], endsAt: { gte: now }, startsAt: { lte: now } }, orderBy: { endsAt: "asc" } }),
    db.gamificationEvent.aggregate({ where: { userId: user.id, createdAt: { gte: monthStart } }, _sum: { points: true } }),
    db.achievement.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.userAchievement.findMany({ where: { userId: user.id } }),
    db.userAchievement.findFirst({ where: { userId: user.id, earnedAt: { gte: subDays(now, 3) } }, orderBy: { earnedAt: "desc" }, include: { achievement: true } }),
    db.lead.findMany({ where: { AND: [scope, { isArchived: false, stage: { key: "NEW" } }] }, orderBy: { assignedAt: "asc" }, take: 5, include: { contact: { select: { id: true, firstName: true, lastName: true, phone: true } }, interestedModel: { select: { name: true } } } }),
  ]);
  const goalRows = await Promise.all(goals.map(async (g) => ({ g, p: await goalProgress(g) })));
  // Showroom & YADEA account snapshot (only for roles that can see inventory / orders / the ledger)
  const showroom = can(user, "inventory.view")
    ? await Promise.all([
        db.inventoryItem.findMany({ where: { dealershipId: { in: ids } }, select: { quantity: true, reorderLevel: true } }),
        can(user, "procurement.order") ? db.procurementOrder.count({ where: { dealershipId: { in: ids }, status: { in: ["SUBMITTED", "APPROVED"] } } }) : Promise.resolve(null),
        can(user, "procurement.order") ? db.procurementOrder.count({ where: { dealershipId: { in: ids }, status: "DELIVERED", receivedById: null } }) : Promise.resolve(null),
        can(user, "ledger.view") ? Promise.all(ids.map((id) => dealerBalance(id))).then((all) => all.reduce((s, b) => s + b.balance, 0)) : Promise.resolve(null),
      ])
    : null;
  const setupSteps = ids[0] ? buildDealerChecklist(await getDealerSetupCounts(ids[0]), (perm) => can(user, perm as Parameters<typeof can>[1])) : [];
  const company = byOrigin.find((o) => o.origin === "COMPANY")?._count._all ?? 0;
  const walkin = byOrigin.find((o) => o.origin === "DEALERSHIP_WALK_IN")?._count._all ?? 0;
  const earnedMap = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));

  return (
    <>
      <Celebrate badge={latestBadge ? { id: latestBadge.id, name: latestBadge.achievement.name, description: latestBadge.achievement.description } : null} />
      {sp.denied && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">You don&apos;t have access to that page.</p>}
      <DashboardHero
        greeting={greeting(now)}
        name={user.name.split(" ")[0]!}
        subtitle={`${user.memberships.map((m) => m.dealershipName).join(", ")} · last 30 days`}
        stats={[
          { label: "Leads received", value: String(kpi.leadsInPeriod) },
          { label: "Need follow-up", value: String(kpi.followUp) },
          { label: "Converted", value: String(kpi.converted) },
        ]}
      />

      <SetupChecklist steps={setupSteps} userId={user.id} />

      {/* Gamified hero */}
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-800 p-5 text-white lg:col-span-2">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-brand-500/20 blur-2xl" />
          <div className="relative flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs font-semibold tracking-wider text-brand-200 uppercase">Your points this month</p>
              <p className="mt-1 text-4xl font-bold tabular-nums">{myPoints._sum.points ?? 0}</p>
              <p className="text-sm text-ink-300">Earned from real follow-ups, test drives and conversions</p>
            </div>
            <div className="ml-auto grid grid-cols-3 gap-4 text-center">
              <div><p className="text-2xl font-bold">{earned.length}</p><p className="text-xs text-ink-300">badges</p></div>
              <div><p className="text-2xl font-bold">{kpi.converted}</p><p className="text-xs text-ink-300">converted</p></div>
              <div><p className="text-2xl font-bold">{kpi.conversionRate}%</p><p className="text-xs text-ink-300">conv. rate</p></div>
            </div>
          </div>
          <Link href="/portal/leaderboard" className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-200 hover:text-white"><Trophy className="h-4 w-4" /> See the leaderboard →</Link>
        </div>
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-brand-500" /> Respond to new leads first</p>
          {newLeads.length ? (
            <ul className="space-y-2">
              {newLeads.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/portal/contacts/${l.contact.id}?lead=${l.id}`} className="link flex-1 truncate">{fullName(l.contact)}</Link>
                  <span className="text-xs text-ink-400">{l.interestedModel?.name}</span>
                  {l.contact.phone && <a href={`tel:${l.contact.phone.replace(/\s/g, "")}`} aria-label={`Call ${fullName(l.contact)}`} className="rounded-md bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"><Phone className="h-3.5 w-3.5" /></a>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-500">No new leads waiting. 🎉</p>}
          <p className="mt-3 text-xs text-ink-400">Contacting a new lead within the response window earns a Quick Responder bonus.</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="Leads received (30d)" value={kpi.leadsInPeriod} icon={Users} delta={kpi.leadsDelta === null ? null : { value: kpi.leadsDelta }} />
        <StatCard label="New leads" value={newLeads.length} icon={Sparkles} tone="violet" href="/portal/leads?stage=NEW" />
        <StatCard label="Need follow-up" value={kpi.followUp} icon={AlarmClock} tone="amber" href="/portal/leads?followUp=due" />
        <StatCard label="Contacted (open)" value={contacted} icon={UserCheck} tone="blue" />
        <StatCard label="Qualified & beyond" value={qualified} icon={Target} tone="brand" />
        <StatCard label="Test drives scheduled" value={kpi.tdScheduled} icon={Bike} tone="blue" href="/portal/test-drives?status=upcoming" />
        <StatCard label="Test drives completed" value={kpi.tdCompleted} icon={CheckCircle2} tone="green" />
        <StatCard label="Converted" value={kpi.converted} icon={Trophy} tone="green" hint={fmtMoney(kpi.salesRevenue)} />
        <StatCard label="Lost" value={kpi.lost} icon={XCircle} tone="red" />
        <StatCard label="Pending tasks" value={pendingTasks} icon={CheckSquare} tone="gray" href="/portal/tasks" />
        <StatCard label="Overdue follow-ups" value={overdue} icon={AlarmClock} tone="red" href="/portal/tasks?due=overdue" />
        <StatCard label="Conversion rate" value={`${kpi.conversionRate}%`} icon={Target} tone="brand" hint="leads created in period" />
      </div>

      {showroom && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Low stock items" value={showroom[0].filter((i) => stockState(i.quantity, i.reorderLevel) === "LOW").length} icon={Boxes} tone="amber" href="/portal/inventory" hint="At or below reorder level" />
          <StatCard label="Out of stock" value={showroom[0].filter((i) => stockState(i.quantity, i.reorderLevel) === "OUT").length} icon={PackageX} tone="red" href="/portal/inventory" />
          {showroom[1] !== null && <StatCard label="Open stock orders" value={showroom[1]} icon={Truck} tone="violet" href="/portal/stock-orders" hint={showroom[2] ? `${showroom[2]} delivery to confirm` : undefined} />}
          {showroom[3] !== null && <StatCard label="Balance owed to YADEA" value={fmtMoney(showroom[3])} icon={Wallet} tone={showroom[3] > 0 ? "red" : "green"} href="/portal/ledger" />}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Link href="/portal/leads?origin=COMPANY" className="card flex items-center gap-4 p-5 transition hover:shadow-[var(--shadow-pop)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Building2 className="h-6 w-6" /></span>
          <div><p className="text-sm text-ink-500">Company-assigned leads</p><p className="text-2xl font-bold">{company}</p><p className="text-xs text-ink-400">From YADEA marketing, website forms and the central CRM</p></div>
        </Link>
        <Link href="/portal/leads?origin=DEALERSHIP_WALK_IN" className="card flex items-center gap-4 p-5 transition hover:shadow-[var(--shadow-pop)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Footprints className="h-6 w-6" /></span>
          <div><p className="text-sm text-ink-500">Dealership walk-in leads</p><p className="text-2xl font-bold">{walkin}</p><p className="text-xs text-ink-400">Created by your team — visible only to your dealership</p></div>
        </Link>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <GoalsPanel rows={goalRows} className="xl:col-span-2" description="Set by YADEA — progress is calculated from recorded activity" emptyHint="YADEA can set monthly targets for your dealership." />
        <Card>
          <CardHeader title="Your badges" />
          <div className="p-4"><BadgeGrid all={achievements} earned={earnedMap} /></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming test drives" action={<Link href="/portal/test-drives" className="text-xs font-medium text-brand-600 hover:underline">All →</Link>} />
          <ul className="divide-y divide-ink-100">
            {upcoming.map((t) => (
              <li key={t.id} className="px-5 py-3 text-sm">
                <div className="flex items-center gap-2"><Link href={`/portal/contacts/${t.contact.id}`} className="link flex-1 truncate">{fullName(t.contact)}</Link><Badge tone={TEST_DRIVE_STATUS[t.status]!.tone}>{TEST_DRIVE_STATUS[t.status]!.label}</Badge></div>
                <p className="text-xs text-ink-500">{fmtDateTime(t.scheduledAt)} · {t.bikeModel.name}</p>
              </li>
            ))}
            {upcoming.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">Nothing scheduled.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent assignments" />
          <ul className="divide-y divide-ink-100">
            {recentAssign.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <Link href={`/portal/contacts/${a.lead.contact.id}?lead=${a.lead.id}`} className="link">{fullName(a.lead.contact)}</Link>
                <p className="text-xs text-ink-500">{a.type === "AUTOMATIC" ? "Auto-assigned" : "Assigned"} {fmtRelative(a.createdAt)}{a.toUser ? ` · ${a.toUser.name}` : " · no rep yet"}</p>
              </li>
            ))}
            {recentAssign.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No assignments yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title={isManager ? "Team activity" : "Your recent activity"} />
          <ul className="divide-y divide-ink-100">
            {team.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p className="text-ink-800"><span className="font-medium">{a.user?.name}</span> · {ACTIVITY_LABELS[a.type]}</p>
                <p className="truncate text-xs text-ink-500">{a.contact ? fullName(a.contact) : ""} · {fmtRelative(a.occurredAt)}</p>
              </li>
            ))}
            {team.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No activity yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
