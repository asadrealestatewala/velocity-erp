import Link from "next/link";
import { ScrollText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterTabs, SearchBox } from "@/components/platform/list";
import { SavedViews } from "@/components/platform/saved-views";
import { Pagination, parseListParams, TableWrap } from "@/components/ui/table";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

const RANGES = [{ key: "", label: "All time", days: 0 }, { key: "1", label: "Last 24 hours", days: 1 }, { key: "7", label: "Last 7 days", days: 7 }, { key: "30", label: "Last 30 days", days: 30 }];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; range?: string; page?: string; pageSize?: string }> }) {
  await requireAdminPage("audit.view");
  const sp = await searchParams;
  const { q, range = "" } = sp;
  const { page, pageSize, skip } = parseListParams(sp);
  const search = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { adminEmail: { contains: q, mode: "insensitive" as const } }, { targetId: { contains: q } }] } : {};
  const since = (days: number) => (days ? { at: { gte: new Date(Date.now() - days * 86_400_000) } } : {});
  const active = RANGES.find((r) => r.key === range) ?? RANGES[0]!;
  const [rows, counts] = await Promise.all([
    platformDb().platformAudit.findMany({ where: { ...search, ...since(active.days) }, orderBy: [{ at: "desc" }, { id: "desc" }], skip, take: pageSize }),
    Promise.all(RANGES.map((r) => platformDb().platformAudit.count({ where: { ...search, ...since(r.days) } }))),
  ]);
  const href = (r: string) => `/platform/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { range: r } : {}) })}`;
  return (
    <>
      <PageHeader title="Audit log" description="Every platform action, who did it and why. Entries cannot be edited or deleted from the console." />
      <FilterTabs label="Filter by time" active={active.key} tabs={RANGES.map((r, i) => ({ key: r.key, label: r.label, count: counts[i], href: href(r.key) }))} />
      <SearchBox id="audit-q" label="Search" action="/platform/audit" q={q} placeholder="Action, person or id" keep={{ range }} clearHref={href(range)} />
      <SavedViews storageKey="audit" />
      <TableWrap stack footer={<Pagination base="/platform/audit" params={{ q, range: range || undefined, pageSize: sp.pageSize }} page={page} pageSize={pageSize} total={counts[RANGES.indexOf(active)] ?? 0} />}>
        <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Target</th><th className="px-4 py-2.5">Reason / detail</th></tr></thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 whitespace-nowrap" data-label="When">{fmtDateTime(r.at)}</td>
              <td className="px-4 py-2" data-label="Who">{r.adminEmail ?? "system"}</td>
              <td className="px-4 py-2 font-mono text-xs" data-label="Action">{r.action}</td>
              <td className="px-4 py-2 text-xs" data-label="Target">{r.targetType ? `${r.targetType} ${r.targetId ?? ""}` : "—"}</td>
              <td className="px-4 py-2 text-xs text-ink-600">{r.reason ?? ""}{r.detail && Object.keys(r.detail as object).length ? <code className="ml-1 break-all text-ink-500">{JSON.stringify(r.detail)}</code> : null}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5}><EmptyState icon={ScrollText} title={q || range ? "No entries match these filters" : "Nothing logged yet"} description={q || range ? "Try a wider time range or a different search." : "Actions taken in the console will be recorded here."} action={q || range ? <Link href="/platform/audit" className="link text-sm">Clear filters</Link> : undefined} /></td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
