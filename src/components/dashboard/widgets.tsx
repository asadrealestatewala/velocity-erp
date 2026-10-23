import Link from "next/link";
import { AlarmClock, ArrowRight, Bike, CalendarCheck, Check, CheckCircle2, Filter, Flame, Medal, Rocket, Store, Trophy, Zap, type LucideIcon } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/misc";
import { GrowBar, ProgressRing } from "@/components/ui/motion";
import type { DailyMission } from "@/server/services/progress";
import type { FunnelStage } from "@/server/services/funnel";
import { cn, fmtDateTime, fullName } from "@/lib/utils";

/** Warm-dark welcome banner. The three figures are the period's real KPIs. */
export function DashboardHero({ greeting: hello, name, subtitle, stats }: { greeting: string; name: string; subtitle: string; stats: { label: string; value: string }[] }) {
  return (
    <section aria-label="Welcome" className="surface-graphite relative isolate mb-4 overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-lift)] sm:p-7">
      <div aria-hidden className="hairline-gradient absolute inset-x-0 top-0 h-px" />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-4xl">
            {hello}, <span className="text-gradient-brand">{name}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">{subtitle}</p>
        </div>
        <dl className="flex flex-wrap gap-3">
          {stats.map((s, i) => (
            <div key={s.label} className={cn("min-w-[104px] rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur", i === 0 ? "float-y" : i === 1 ? "float-y-slow" : "float-y")}>
              <dt className="text-[11px] font-medium text-white/55">{s.label}</dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Time-of-day greeting in the business timezone. */
export function greeting(now = new Date(), tz = process.env.APP_TIMEZONE || "Asia/Karachi") {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now)) % 24;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

type Tone = "red" | "amber" | "violet";
const ALERT: Record<Tone, { card: string; chip: string; label: string }> = {
  red: { card: "border-red-200/80 bg-gradient-to-r from-red-50 to-white hover:border-red-300", chip: "bg-red-500", label: "text-red-700" },
  amber: { card: "border-amber-200/80 bg-gradient-to-r from-amber-50 to-white hover:border-amber-300", chip: "bg-amber-500", label: "text-amber-700" },
  violet: { card: "border-xp-100 bg-gradient-to-r from-xp-50 to-white hover:border-xp-400/50", chip: "bg-xp-500", label: "text-xp-700" },
};

export type AlertItem = { label: string; count: number; href: string; tone: Tone; icon: LucideIcon; action: string };

/** Real counts only; an alert with nothing to do isn't shown. */
export function AlertCards({ items }: { items: AlertItem[] }) {
  const active = items.filter((i) => i.count > 0);
  if (!active.length)
    return (
      <div className="card mb-4 flex items-center gap-3 border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> You&apos;re all caught up — no unassigned leads, due follow-ups or pending applications.
      </div>
    );
  return (
    <div className="stagger mb-4 grid gap-3 md:grid-cols-3" role="list" aria-label="Needs attention">
      {active.map((a) => {
        const t = ALERT[a.tone];
        const Icon = a.icon;
        return (
          <Link key={a.label} href={a.href} role="listitem" className={cn("group flex items-center gap-3 rounded-2xl border p-3.5 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]", t.card)}>
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm", t.chip)}><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-2xl leading-none font-bold text-ink-900 tabular-nums">{a.count}</span>
              <span className={cn("mt-1 block truncate text-[13px] font-medium", t.label)}>{a.label}</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-ink-500 transition group-hover:text-ink-900">
              <span className="hidden sm:inline">{a.action}</span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Daily missions + level + streak. XP shown is what the audited event log recorded today. */
export function GamificationCard({
  missions,
  xpToday,
  level,
  streak,
  week,
}: {
  missions: DailyMission[];
  xpToday: number;
  level: { level: number; xpIntoLevel: number; xpForNext: number; toNext: number; pct: number };
  streak: { days: number; next: number | null };
  week: { date: Date; active: boolean }[];
}) {
  const completed = missions.filter((m) => m.complete).length;
  const pct = Math.round((completed / missions.length) * 100);
  const current = missions.find((m) => !m.complete);
  return (
    <Card>
      <CardHeader title="Daily goals & gamification" description="Progress comes from your recorded activity today" action={<Link href="/crm/leaderboard" className="text-xs font-medium text-brand-600 hover:underline">Leaderboard →</Link>} />
      <div className="grid gap-5 p-5 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-wrap items-center gap-5 lg:flex-col lg:items-stretch">
          <div className="flex items-center gap-4">
            <ProgressRing pct={pct} color="var(--color-xp-600)" size={104}>
              <span className="text-xl leading-none font-bold text-ink-900 tabular-nums">{completed}/{missions.length}</span>
              <span className="mt-0.5 text-[10.5px] font-medium text-ink-500">goals done</span>
            </ProgressRing>
            <div className="space-y-2">
              <div className="rounded-xl bg-xp-50 px-3 py-2">
                <p className="flex items-center gap-1 text-lg leading-none font-bold text-xp-700 tabular-nums"><Zap className="h-4 w-4" aria-hidden />+{xpToday} XP</p>
                <p className="text-[11px] text-xp-700/70">earned today</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2">
                <p className="flex items-center gap-1 text-lg leading-none font-bold text-amber-700 tabular-nums"><Flame className="h-4 w-4" aria-hidden />{streak.days} {streak.days === 1 ? "day" : "days"}</p>
                <p className="text-[11px] text-amber-700/70">{streak.next ? `next milestone: ${streak.next} days` : "streak"}</p>
              </div>
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-xp-700">Level {level.level}</span>
              <span className="text-ink-500 tabular-nums">{level.xpIntoLevel} / {level.xpForNext} XP</span>
            </div>
            <ProgressBar value={level.pct} color="linear-gradient(90deg, var(--color-xp-500), var(--color-xp-400))" />
            <p className="mt-1 text-[11px] text-ink-400">{level.toNext} XP to level {level.level + 1}</p>
            <ul className="mt-3 flex gap-1.5" aria-label="Activity in the last 7 days">
              {week.map((d) => (
                <li key={d.date.toISOString()} className="text-center">
                  <span title={d.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} className={cn("flex h-6 w-6 items-center justify-center rounded-full text-white", d.active ? "bg-amber-500" : "bg-ink-100")}>
                    {d.active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-400">{d.date.toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          {current && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm">
              <Rocket className="h-4 w-4 text-brand-600" aria-hidden />
              <span className="text-ink-600">Current mission:</span>
              <b className="text-ink-900">{current.title}</b>
              <span className="ml-auto text-xs font-semibold text-brand-700 tabular-nums">{current.done}/{current.target}</span>
            </div>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {missions.map((m) => (
              <li key={m.key} className={cn("rounded-xl border p-3", m.complete ? "border-emerald-200 bg-emerald-50/50" : "border-ink-200/80 bg-white")}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-[13.5px] leading-snug font-medium text-ink-900">{m.title}</p>
                  {m.complete ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden /></span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-ink-500 tabular-nums">{m.done}/{m.target}</span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={m.done} aria-valuemin={0} aria-valuemax={m.target} aria-label={m.title}>
                  <GrowBar pct={(m.done / m.target) * 100} color={m.complete ? "#10b981" : "var(--color-xp-500)"} className="h-full rounded-full" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={m.xp ? "font-semibold text-xp-700" : "text-ink-400"}>{m.xp ? `+${m.xp} XP earned` : "No XP yet"}</span>
                  {!m.complete && <Link href={m.href} className="font-medium text-brand-600 hover:underline">{m.action} →</Link>}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-400">XP is awarded once per lead or task for real events (first contact, follow-up, stage change, test drive, conversion). Opening pages or repeating clicks earns nothing.</p>
        </div>
      </div>
    </Card>
  );
}

/** Pipeline funnel from the real stage definitions. Bar width = share of leads that reached the stage. */
export function FunnelCard({ stages, total, lost, hrefFor }: { stages: FunnelStage[]; total: number; lost: number; hrefFor: (stageId: string) => string }) {
  return (
    <Card>
      <CardHeader title="Conversion funnel" description="Leads that reached each pipeline stage (current pipeline)" action={<Link href="/crm/pipeline" className="text-xs font-medium text-brand-600 hover:underline">Pipeline →</Link>} />
      {total === 0 ? (
        <EmptyState icon={Filter} title="No leads in the pipeline" description="The funnel fills as leads are created." />
      ) : (
        <div className="p-5">
          <ul className="space-y-2">
            {stages.map((s) => (
              <li key={s.id}>
                <Link href={hrefFor(s.id)} className="group block rounded-xl p-1.5 transition hover:bg-ink-50" title={`${s.atStage} lead(s) currently in ${s.name}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-ink-800"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    <span className="text-ink-500 tabular-nums">
                      <b className="text-ink-900">{s.reached}</b> reached · <b className="text-ink-900">{s.atStage}</b> here
                      {s.stepPct !== null && <span className="ml-2 text-xs text-ink-400">{s.stepPct}% of previous</span>}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-ink-100">
                    <GrowBar pct={Math.max(s.ofTotalPct, s.reached ? 3 : 0)} color={s.color} className="h-full rounded-full" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between text-xs text-ink-400">
            <span>{total} open &amp; won leads in total</span>
            <span>{lost} lost (not in the funnel)</span>
          </p>
        </div>
      )}
    </Card>
  );
}

type FollowUp = { id: string; title: string; dueAt: Date; contact: { id: string; firstName: string; lastName: string | null } | null; assignedTo: { name: string } };
type TestDrive = { id: string; scheduledAt: Date; status: string; contact: { id: string; firstName: string; lastName: string | null }; bikeModel: { name: string } | null };
type Application = { id: string; businessName: string; createdAt: Date; status: string };

/** Follow-ups (overdue first), upcoming test drives and applications awaiting review. */
export function RemindersCard({ followUps, testDrives, applications, canReviewApplications }: { followUps: FollowUp[]; testDrives: TestDrive[]; applications: Application[]; canReviewApplications: boolean }) {
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const rows = [
    ...followUps.map((t) => {
      const overdue = t.dueAt < now;
      const today = !overdue && t.dueAt <= endToday;
      return {
        key: `t${t.id}`, icon: AlarmClock, tone: overdue ? "red" : today ? "amber" : "gray", priority: overdue ? "Overdue" : today ? "Today" : "Upcoming", rank: overdue ? 0 : today ? 1 : 3,
        title: t.title, sub: `${t.contact ? fullName(t.contact) : "—"} · ${t.assignedTo.name}`, when: t.dueAt, href: t.contact ? `/crm/contacts/${t.contact.id}` : "/crm/tasks",
      };
    }),
    ...testDrives.map((d) => ({
      key: `d${d.id}`, icon: Bike, tone: "blue", priority: "Test drive", rank: 2,
      title: `Test drive · ${fullName(d.contact)}`, sub: d.bikeModel?.name ?? "Model to be confirmed", when: d.scheduledAt, href: "/crm/test-drives",
    })),
    ...(canReviewApplications
      ? applications.map((a) => ({
          key: `a${a.id}`, icon: Store, tone: "violet", priority: "Review", rank: 2,
          title: `Review application · ${a.businessName}`, sub: a.status === "INFO_REQUIRED" ? "Waiting for more information" : "Awaiting a decision", when: a.createdAt, href: "/crm/applications",
        }))
      : []),
  ].sort((a, b) => a.rank - b.rank || a.when.getTime() - b.when.getTime());
  const chip: Record<string, string> = { red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-600", blue: "bg-blue-50 text-blue-600", violet: "bg-xp-50 text-xp-600", gray: "bg-ink-100 text-ink-500" };
  const badge: Record<string, "red" | "amber" | "blue" | "violet" | "gray"> = { red: "red", amber: "amber", blue: "blue", violet: "violet", gray: "gray" };
  return (
    <Card>
      <CardHeader title="Quick reminders" description="Overdue first, then today and upcoming" action={<Link href="/crm/tasks" className="text-xs font-medium text-brand-600 hover:underline">All tasks →</Link>} />
      {rows.length ? (
        <ul className="divide-y divide-ink-100">
          {rows.slice(0, 9).map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50/70">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", chip[r.tone])}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                    <span className="block truncate text-xs text-ink-500">{r.sub}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Badge tone={badge[r.tone]}>{r.priority}</Badge>
                    <span className="mt-0.5 block text-[11px] text-ink-400">{fmtDateTime(r.when)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={CalendarCheck} title="Nothing to chase" description="No follow-ups, test drives or applications need attention." />
      )}
    </Card>
  );
}

type Rank = { id: string; name: string; subtitle?: string | null; score: number; points: number; converted: number };

/** Top performers for the month — dealership reps ranked by the normalised score, with their real conversions. */
export function LeaderboardCard({ rows, period }: { rows: Rank[]; period: string }) {
  const top = rows.slice(0, 5);
  const best = Math.max(1, ...top.map((r) => r.score));
  return (
    <Card>
      <CardHeader title="Team leaderboard" description={period} action={<Link href="/crm/leaderboard" className="text-xs font-medium text-brand-600 hover:underline">Full leaderboard →</Link>} />
      {top.length ? (
        <ol className="divide-y divide-ink-100">
          {top.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-ink-100 text-ink-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-ink-50 text-ink-500")}>
                {i < 3 ? <Medal className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <Avatar name={r.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{r.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><GrowBar pct={(r.score / best) * 100} color="var(--color-xp-500)" className="h-full rounded-full" /></div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-xp-700 tabular-nums">{r.points} XP</p>
                <p className="text-[11px] text-ink-400">{r.converted} converted</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={Trophy} title="No activity this month yet" description="Rankings appear once reps complete tracked actions." />
      )}
    </Card>
  );
}

