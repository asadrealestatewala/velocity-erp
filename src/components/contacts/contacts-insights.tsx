import Link from "next/link";
import { startOfMonth } from "date-fns";
import { Check, Download, Flame, KanbanSquare, ListChecks, Medal, Target, Trophy, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, leadScope } from "@/server/authz";
import { getLeaderboard, goalProgress, GOAL_LABELS } from "@/server/services/analytics";
import { getUserProgress, getWeekActivity, nextStreakMilestone } from "@/server/services/progress";
import { Avatar, Card, CardHeader } from "@/components/ui/misc";
import { ProgressRing } from "@/components/ui/motion";
import { cn, fmtMoney, fmtRelative, fullName } from "@/lib/utils";

/** Right-hand panel on the contacts page. Everything shown is read from recorded data the signed-in user may see. */
export async function ContactsInsights({ user, exportHref }: { user: CurrentUser; exportHref: string | null }) {
  const now = new Date();
  const [goals, board, progress, week, wins] = await Promise.all([
    db.goal.findMany({
      where: { endsAt: { gte: now }, startsAt: { lte: now }, metric: { in: ["CONVERSIONS", "SALES_REVENUE", "TEST_DRIVES_COMPLETED"] } },
      orderBy: { endsAt: "asc" },
      take: 1,
      include: { dealership: { select: { name: true } } },
    }),
    getLeaderboard("rep", { from: startOfMonth(now), to: now }),
    getUserProgress(user.id, now),
    getWeekActivity(user.id, now),
    db.lead.findMany({
      where: { AND: [leadScope(user), { stage: { kind: "WON" }, convertedAt: { not: null } }] },
      orderBy: { convertedAt: "desc" },
      take: 4,
      select: { id: true, convertedAt: true, conversionValue: true, contact: { select: { id: true, firstName: true, lastName: true } }, dealership: { select: { name: true } } },
    }),
  ]);
  const goal = goals[0] ?? null;
  const gp = goal ? await goalProgress(goal) : null;
  const next = nextStreakMilestone(progress.streakDays);
  const actions = [
    ...(can(user, "contacts.create") ? [{ href: "/crm/contacts/new", label: "Add new contact", icon: UserPlus }] : []),
    { href: "/crm/tasks", label: "Follow-up tasks", icon: ListChecks },
    { href: "/crm/pipeline", label: "View pipeline", icon: KanbanSquare },
    ...(exportHref ? [{ href: exportHref, label: "Export these contacts", icon: Download }] : []),
  ];
  return (
    <aside aria-label="Sales insights" className="space-y-4">
      <Card>
        <CardHeader title="Sales progress" />
        <div className="p-4">
          {goal && gp ? (
            <div className="flex items-center gap-4">
              <ProgressRing pct={gp.progress} size={92} stroke={9} color={gp.achieved ? "#10b981" : "var(--color-brand-600)"}>
                <span className="text-lg leading-none font-bold text-ink-900 tabular-nums">{gp.progress}%</span>
              </ProgressRing>
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold text-ink-900">{goal.name}</p>
                <p className="text-xs text-ink-500">{goal.dealership?.name ?? GOAL_LABELS[goal.metric].label}</p>
                <p className="mt-1 text-ink-700 tabular-nums">
                  <b>{goal.metric === "SALES_REVENUE" ? fmtMoney(gp.current) : gp.current}</b> / {goal.metric === "SALES_REVENUE" ? fmtMoney(gp.target) : gp.target}
                </p>
                <p className="text-[11px] text-ink-400">ends {goal.endsAt.toLocaleDateString("en-GB")}</p>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-500"><Target className="h-4 w-4 text-ink-400" aria-hidden />No active sales goal. Targets set in Settings appear here.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Team achievements" description="Dealership reps, this month" action={<Link href="/crm/leaderboard" className="text-xs font-medium text-brand-600 hover:underline">All →</Link>} />
        {board.length ? (
          <ol className="divide-y divide-ink-100">
            {board.slice(0, 3).map((r, i) => (
              <li key={r.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Medal className={cn("h-4 w-4 shrink-0", i === 0 ? "text-amber-500" : i === 1 ? "text-ink-400" : "text-orange-600")} aria-label={`Rank ${i + 1}`} />
                <Avatar name={r.name} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{r.name}</span>
                <span className="text-xs font-bold text-xp-700 tabular-nums">{r.points} XP</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500"><Trophy className="h-4 w-4 text-ink-400" aria-hidden />No tracked activity this month yet.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Follow-up streak" />
        <div className="p-4">
          <p className="flex items-center gap-2 text-2xl font-bold text-ink-900 tabular-nums">
            <Flame className="h-6 w-6 text-amber-500" aria-hidden />{progress.streakDays} <span className="text-sm font-medium text-ink-500">{progress.streakDays === 1 ? "day" : "days"}</span>
          </p>
          <p className="text-xs text-ink-500">{next ? `${next - progress.streakDays} more day(s) to the ${next}-day milestone` : "Longest milestone reached — keep it going"}</p>
          <ul className="mt-3 flex gap-1.5" aria-label="Activity in the last 7 days">
            {week.map((d) => (
              <li key={d.date.toISOString()} className="text-center">
                <span title={d.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} className={cn("flex h-6 w-6 items-center justify-center rounded-full text-white", d.active ? "bg-amber-500" : "bg-ink-100")}>
                  {d.active && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-[10px] text-ink-400">{d.date.toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader title="Quick actions" />
        <ul className="p-2">
          {actions.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50 hover:text-ink-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><a.icon className="h-4 w-4" aria-hidden /></span>
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {wins.length > 0 && (
        <Card>
          <CardHeader title="Recent conversions" />
          <ul className="divide-y divide-ink-100">
            {wins.map((w) => (
              <li key={w.id} className="px-4 py-2.5 text-sm">
                <Link href={`/crm/contacts/${w.contact.id}`} className="link block truncate">{fullName(w.contact)}</Link>
                <p className="truncate text-xs text-ink-500">{w.dealership?.name ?? "—"}{w.conversionValue ? ` · ${fmtMoney(Number(w.conversionValue))}` : ""} · {w.convertedAt ? fmtRelative(w.convertedAt) : ""}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </aside>
  );
}

