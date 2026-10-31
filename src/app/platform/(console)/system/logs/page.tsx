import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Logs" };

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  await requireAdminPage("system.manage");
  const { source } = await searchParams;
  const db = platformDb();
  const [errors, jobs, sources] = await Promise.all([
    db.errorLog.findMany({ where: source ? { source } : {}, orderBy: { at: "desc" }, take: 100 }),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
    db.errorLog.groupBy({ by: ["source"], _count: { _all: true }, orderBy: { source: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Logs" description="Recent job runs and server errors. Errors are kept 30 days, job history 90." breadcrumbs={[{ label: "System", href: "/platform/system" }, { label: "Logs" }]} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href="/platform/system/logs" className={source ? "text-ink-600 underline" : "font-semibold"}>All errors</Link>
        {sources.map((s) => <Link key={s.source} href={`/platform/system/logs?source=${encodeURIComponent(s.source)}`} className={source === s.source ? "font-semibold" : "text-ink-600 underline"}>{s.source} ({s._count._all})</Link>)}
      </div>
      <TableWrap>
        <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5">Message</th><th className="px-4 py-2.5">Where</th></tr></thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {errors.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(e.at)}</td>
              <td className="px-4 py-2 font-mono text-xs">{e.source}</td>
              <td className="px-4 py-2"><details><summary className="cursor-pointer">{e.message.slice(0, 140)}</summary>{e.stack && <pre className="mt-2 max-h-60 overflow-auto rounded bg-ink-50 p-2 text-xs whitespace-pre-wrap">{e.stack}</pre>}</details></td>
              <td className="px-4 py-2 text-xs text-ink-600">{e.path ?? ""}{e.detail && Object.keys(e.detail as object).length ? <code className="ml-1 break-all text-ink-500">{JSON.stringify(e.detail)}</code> : null}</td>
            </tr>
          ))}
          {!errors.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-500">No errors recorded. 🎉</td></tr>}
        </tbody>
      </TableWrap>
      <h2 className="mt-6 mb-2 text-sm font-semibold">Job runs</h2>
      <TableWrap>
        <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">Started</th><th className="px-4 py-2.5">Job</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5">Took</th><th className="px-4 py-2.5">Summary</th></tr></thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(j.startedAt)}</td>
              <td className="px-4 py-2 font-mono text-xs">{j.job}</td>
              <td className="px-4 py-2">{j.finishedAt ? <Badge tone={j.ok ? "green" : "red"}>{j.ok ? "ok" : "failed"}</Badge> : <Badge tone="amber">running or interrupted</Badge>}</td>
              <td className="px-4 py-2 text-xs">{j.finishedAt ? `${((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000).toFixed(1)} s` : "—"}</td>
              <td className="px-4 py-2 text-xs text-ink-600">{j.error ?? <code className="break-all">{JSON.stringify(j.summary).slice(0, 200)}</code>}</td>
            </tr>
          ))}
          {!jobs.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No job runs recorded yet. Make sure the scheduler calls /api/jobs/run.</td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
