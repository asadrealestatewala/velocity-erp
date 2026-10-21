import Link from "next/link";
import { Award, Flame, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import type { UserProgress } from "@/server/services/progress";
import { CountUp } from "@/components/ui/motion";
import { Badge, Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/misc";
import { GOAL_LABELS } from "@/server/services/analytics";
import { fmtMoney } from "@/lib/utils";
import type { GoalMetric } from "@prisma/client";

/** Graphite hero: the signed-in user's own recorded progress. Hidden by the caller when there is nothing recorded yet. */
export function ProgressHero({ progress, leaderboardHref }: { progress: UserProgress; leaderboardHref: string }) {
  const { monthPoints, weekDelta, streakDays, badgesEarned, badgesTotal, next, rank } = progress;
  const ring = badgesTotal ? Math.round((badgesEarned / badgesTotal) * 100) : 0;
  return (
    <div className="surface-graphite relative isolate overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-lift)] sm:p-6">
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold tracking-wider text-white/60 uppercase">Your points this month</p>
          <p className="mt-1 flex items-baseline gap-3 text-5xl font-bold tracking-tight tabular-nums">
            <CountUp value={monthPoints.toLocaleString("en-US")} />
            {weekDelta !== null && (
              <span className={weekDelta >= 0 ? "inline-flex items-center gap-1 text-sm font-semibold text-emerald-300" : "inline-flex items-center gap-1 text-sm font-semibold text-red-300"}>
                {weekDelta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {Math.abs(weekDelta)}% vs previous 7 days
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-white/60">Earned from first contacts, completed follow-ups, test drives and conversions.</p>
        </div>

        <dl className="flex flex-wrap gap-3">
          <div className="min-w-[96px] rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/55 uppercase"><Flame className="h-3.5 w-3.5 text-brand-300" />Streak</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums">{streakDays}<span className="ml-1 text-sm font-medium text-white/55">{streakDays === 1 ? "day" : "days"}</span></dd>
          </div>
          <div className="min-w-[96px] rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/55 uppercase"><Award className="h-3.5 w-3.5 text-volt-300" />Badges</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums">{badgesEarned}<span className="ml-1 text-sm font-medium text-white/55">/ {badgesTotal}</span></dd>
          </div>
          {rank && (
            <Link href={leaderboardHref} className="min-w-[96px] rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10 transition hover:bg-white/[0.12]">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/55 uppercase"><Trophy className="h-3.5 w-3.5 text-amber-300" />Rank</dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums">#{rank.position}<span className="ml-1 text-sm font-medium text-white/55">of {rank.of}</span></dd>
            </Link>
          )}
        </dl>
      </div>

      {next ? (
        <div className="mt-5 rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p><span className="text-white/55">Next badge · </span><b className="font-semibold">{next.name}</b> <span className="text-white/55">— {next.description}</span></p>
            <p className="tabular-nums text-white/70">{next.current.toLocaleString("en-US")} / {next.target.toLocaleString("en-US")}</p>
          </div>
          <ProgressBar value={next.pct} className="!bg-white/10" color="linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300))" />
        </div>
      ) : badgesTotal > 0 && badgesEarned === badgesTotal ? (
        <p className="mt-5 text-sm text-white/70">Every badge earned — nothing left to unlock.</p>
      ) : null}
      <p className="sr-only">Badge collection {ring}% complete</p>
    </div>
  );
}

type GoalRow = {
  g: { id: string; name: string; metric: GoalMetric; endsAt: Date; dealershipName?: string | null; userName?: string | null };
  p: { current: number; target: number; progress: number; achieved: boolean; lowerIsBetter: boolean };
};

const show = (metric: GoalMetric, v: number) => (metric === "SALES_REVENUE" ? fmtMoney(v) : `${v}${GOAL_LABELS[metric].unit}`);

/** Active goals with animated progress. Targets are set in Settings; progress is computed from recorded activity. */
export function GoalsPanel({ rows, description, emptyHint, className }: { rows: GoalRow[]; description?: string; emptyHint?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Goals & targets" description={description ?? "Progress is calculated from recorded activity"} />
      {rows.length ? (
        <ul className="divide-y divide-ink-100">
          {rows.map(({ g, p }) => {
            const left = Math.max(0, Math.ceil((g.endsAt.getTime() - Date.now()) / 86400_000));
            return (
              <li key={g.id} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-ink-900">
                    {g.name}
                    {(g.dealershipName || g.userName) && <span className="ml-2 text-xs font-normal text-ink-400">{g.dealershipName ?? g.userName}</span>}
                    {p.achieved && <Badge tone="green" className="ml-2">Goal achieved</Badge>}
                  </p>
                  <p className="text-sm text-ink-600 tabular-nums">
                    <b className="text-ink-900">{show(g.metric, p.current)}</b> / {show(g.metric, p.target)}
                    {p.lowerIsBetter && <span className="text-ink-400"> (lower is better)</span>}
                  </p>
                </div>
                <ProgressBar value={p.progress} color={p.achieved ? "#16a34a" : undefined} />
                <p className="mt-1.5 flex justify-between text-xs text-ink-400">
                  <span>{p.progress}% of target</span>
                  <span>{left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`} · ends {g.endsAt.toLocaleDateString("en-GB")}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Target} title="No active goals" description={emptyHint ?? "Targets set in Settings will appear here with live progress."} />
      )}
    </Card>
  );
}
