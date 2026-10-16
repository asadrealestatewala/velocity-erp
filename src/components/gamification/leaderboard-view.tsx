import Link from "next/link";
import { endOfDay, startOfDay, startOfMonth, startOfQuarter, startOfWeek } from "date-fns";
import { Medal, Trophy } from "lucide-react";
import type { CurrentUser } from "@/server/auth/session";
import { dealershipIds, isCentral } from "@/server/authz";
import { getLeaderboard } from "@/server/services/analytics";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { withParams } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export async function LeaderboardView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const by = (["rep", "dealership", "city"] as const).find((b) => b === params.by) ?? "rep";
  const period = (["week", "month", "quarter", "custom"] as const).find((p) => p === params.period) ?? "month";
  const now = new Date();
  const from =
    period === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : period === "quarter" ? startOfQuarter(now) : period === "custom" && params.from ? startOfDay(new Date(params.from)) : startOfMonth(now);
  const to = period === "custom" && params.to ? endOfDay(new Date(params.to)) : now;
  // Privacy: dealership users only see individual rankings for their own dealership.
  const restrict = !isCentral(user) && by === "rep" ? dealershipIds(user) : undefined;
  const rows = await getLeaderboard(by, { from, to }, restrict);
  const leader = rows[0];
  const tab = (key: string, label: string, active: boolean, href: string) => (
    <Link key={key} href={href} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>{label}</Link>
  );
  const highlight = (id: string) => (by === "rep" ? id === user.id : by === "dealership" ? dealershipIds(user).includes(id) : false);

  return (
    <>
      <PageHeader title="Leaderboard" description="Ranked by a normalised performance score so outlets with different lead volumes compare fairly." />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          {tab("rep", isCentral(user) ? "Sales reps" : "My team", by === "rep", withParams(`${base}/leaderboard`, params, { by: "rep" }))}
          {tab("dealership", "Dealerships", by === "dealership", withParams(`${base}/leaderboard`, params, { by: "dealership" }))}
          {tab("city", "Cities", by === "city", withParams(`${base}/leaderboard`, params, { by: "city" }))}
        </div>
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(["week", "month", "quarter"] as const).map((p) => tab(p, p === "week" ? "This week" : p === "month" ? "This month" : "This quarter", period === p, withParams(`${base}/leaderboard`, params, { period: p, from: undefined, to: undefined })))}
        </div>
        <form className="flex items-center gap-1.5" action={`${base}/leaderboard`}>
          <input type="hidden" name="by" value={by} /><input type="hidden" name="period" value="custom" />
          <input aria-label="From" type="date" name="from" defaultValue={params.from} className="input h-9 w-[140px] py-1.5" required />
          <span className="text-ink-400">–</span>
          <input aria-label="To" type="date" name="to" defaultValue={params.to} className="input h-9 w-[140px] py-1.5" required />
          <button className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium hover:bg-ink-50">Apply</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Trophy} title="No activity in this period yet" description="Points come from first contacts, completed follow-ups, test drives and conversions." /></div>
      ) : (
        <>
          {leader && (
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {rows.slice(0, 3).map((r, i) => (
                <div key={r.id} className={cn("relative overflow-hidden rounded-2xl p-5", i === 0 ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25" : "card")}>
                  <Medal className={cn("absolute top-4 right-4 h-8 w-8", i === 0 ? "text-white/40" : i === 1 ? "text-ink-300" : "text-amber-600/40")} />
                  <p className={cn("text-xs font-semibold tracking-wider uppercase", i === 0 ? "text-brand-100" : "text-ink-400")}>#{i + 1}</p>
                  <p className="mt-1 truncate text-lg font-bold">{r.name}</p>
                  {r.subtitle && <p className={cn("truncate text-xs", i === 0 ? "text-brand-100" : "text-ink-500")}>{r.subtitle}</p>}
                  <p className="mt-3 text-3xl font-bold tabular-nums">{r.score}<span className="ml-1 text-sm font-medium opacity-70">score</span></p>
                  <p className={cn("text-xs", i === 0 ? "text-brand-100" : "text-ink-500")}>{r.points} pts · {r.conversionRate}% conversion · {r.testDrives} test drives</p>
                </div>
              ))}
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="th w-12">#</th><th className="th">{by === "rep" ? "Representative" : by === "dealership" ? "Dealership" : "City"}</th>
                  <th className="th w-48">Score</th><th className="th text-right">Points</th><th className="th text-right">Leads</th><th className="th text-right">Converted</th>
                  <th className="th text-right">Conv. rate</th><th className="th text-right">Test drives</th><th className="th text-right">On-time follow-ups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r, i) => (
                  <tr key={r.id} className={cn(highlight(r.id) && "bg-brand-50/50")}>
                    <td className="td font-semibold text-ink-500">{i + 1}</td>
                    <td className="td"><p className="font-medium text-ink-900">{r.name}{highlight(r.id) && <span className="ml-1.5 text-xs text-brand-600">(you)</span>}</p>{r.subtitle && <p className="text-xs text-ink-400">{r.subtitle}</p>}</td>
                    <td className="td"><div className="flex items-center gap-2"><ProgressBar value={r.score} className="w-24" /><span className="font-semibold tabular-nums">{r.score}</span></div></td>
                    <td className="td text-right tabular-nums">{r.points}</td>
                    <td className="td text-right tabular-nums">{r.leads}</td>
                    <td className="td text-right tabular-nums">{r.converted}</td>
                    <td className="td text-right tabular-nums">{r.conversionRate}%</td>
                    <td className="td text-right tabular-nums">{r.testDrives}</td>
                    <td className="td text-right tabular-nums">{r.followUpsOnTime} <span className="text-ink-400">({r.followUpRate}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-400">Score = 40% conversion rate + 30% on-time follow-up rate + 30% points per assigned lead (capped). Points are awarded once per lead/task event and can&apos;t be farmed by repeating actions.</p>
        </>
      )}
    </>
  );
}
