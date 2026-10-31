import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { RunButton } from "@/components/platform/console";
import { TableWrap } from "@/components/ui/table";
import { markDemoHandledAction } from "@/server/actions/platform-growth";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { getCohorts, getFunnel } from "@/server/platform/growth";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Growth" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await requireAdminPage("reports");
  const { days: d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const [funnel, cohorts, demos] = await Promise.all([getFunnel(from, to), getCohorts(8), platformDb().demoRequest.findMany({ orderBy: [{ handledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 50 })]);
  const top = Math.max(1, ...funnel.steps.map((s) => s.count));
  return (
    <>
      <PageHeader
        title="Growth"
        description="From visit to paying customer, and who keeps coming back. Counts come from real records; page views only cover the public pages and exclude visitors who send Do Not Track."
        actions={me.role === "OWNER" ? <Link className="link text-sm" href="/platform/growth/campaigns">Email campaigns →</Link> : undefined}
      />
      <nav className="mb-4 flex gap-2 text-sm" aria-label="Period">
        {[7, 30, 90].map((n) => <Link key={n} href={`/platform/growth?days=${n}`} className={n === days ? "font-semibold underline" : "text-ink-600"}>Last {n} days</Link>)}
      </nav>
      <Card>
        <CardHeader title="Sign-up funnel" description="Visits are page views, not people. Later steps count workspaces created in this period." />
        <ol className="divide-y divide-ink-100 text-sm">
          {funnel.steps.map((s) => (
            <li key={s.key} className="px-5 py-3">
              <div className="flex items-baseline justify-between"><span>{s.label}</span><span><strong>{s.count}</strong> <span className="text-ink-500">{s.rate === null ? "" : `${pct(s.rate)} of previous step`}</span></span></div>
              <div className="mt-1.5 h-1.5 rounded-full bg-ink-100" aria-hidden><div className="h-full rounded-full bg-ink-800" style={{ width: `${(s.count / top) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Weekly retention" description="Of the workspaces created that week, the share that used the product in each following week. Usage is tracked from the day this feature was switched on." />
        <TableWrap>
          <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">Signed up (week of)</th><th className="px-4 py-2.5">Workspaces</th>{Array.from({ length: 8 }, (_, i) => <th key={i} className="px-4 py-2.5">Wk {i}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100 text-sm">
            {cohorts.map((c) => (
              <tr key={c.weekStart}><td className="px-4 py-2">{c.weekStart}</td><td className="px-4 py-2">{c.size}</td>{Array.from({ length: 8 }, (_, i) => <td key={i} className="px-4 py-2 tabular-nums">{i < c.retention.length ? pct(c.retention[i]!) : ""}</td>)}</tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Demo requests" description="People who asked for a demo on the website." />
        <ul className="divide-y divide-ink-100 text-sm">
          {demos.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name} <span className="text-ink-500">· <a className="link" href={`mailto:${r.email}`}>{r.email}</a>{r.company ? ` · ${r.company}` : ""}</span> {r.handledAt ? <Badge tone="green">handled</Badge> : <Badge tone="amber">new</Badge>}</p>
                {r.message && <p className="whitespace-pre-line text-ink-600">{r.message}</p>}
                <p className="text-xs text-ink-500">{fmtDateTime(r.createdAt)}{r.handledAt ? ` · handled ${fmtDateTime(r.handledAt)} by ${r.handledBy ?? "?"}` : ""}</p>
              </div>
              <RunButton label={r.handledAt ? "Reopen" : "Mark handled"} variant="ghost" action={markDemoHandledAction.bind(null, r.id, !r.handledAt)} />
            </li>
          ))}
          {!demos.length && <li className="px-5 py-4 text-ink-500">No demo requests yet.</li>}
        </ul>
      </Card>
    </>
  );
}
