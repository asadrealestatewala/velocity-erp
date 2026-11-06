import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Building2, Download, Search } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination, parseListParams, TableWrap } from "@/components/ui/table";
import { SavedViews } from "@/components/platform/saved-views";
import { SelectAll } from "@/components/platform/select-all";
import { BulkExtendTrial } from "@/components/platform/bulk-trial";
import { BulkBar } from "@/components/platform/bulk-bar";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { SUB_TONE } from "@/components/platform/tones";
import { tenantWhere } from "@/server/platform/tenant-list";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Workspaces" };

const SUBS = Object.keys(SUB_TONE);
const SUB_LABEL: Record<string, string> = { TRIALING: "On trial", PAST_DUE: "Past due" };
const subLabel = (k: string) => SUB_LABEL[k] ?? k.charAt(0) + k.slice(1).toLowerCase();

export default async function Workspaces({ searchParams }: { searchParams: Promise<{ q?: string; sub?: string; page?: string; pageSize?: string }> }) {
  const me = await requireAdminPage("tenants.view");
  const sp = await searchParams;
  const { q, sub } = sp;
  const { page, pageSize, skip } = parseListParams(sp);
  const where = tenantWhere(q, sub);
  const [rows, counts] = await Promise.all([
    platformDb().tenant.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take: pageSize }),
    platformDb().tenant.groupBy({ by: ["subStatus"], where: tenantWhere(q, undefined), _count: true }),
  ]);
  const countOf = Object.fromEntries(counts.map((c) => [c.subStatus, c._count])) as Record<string, number>;
  const all = counts.reduce((n, c) => n + c._count, 0);
  const shown = sub ? (countOf[sub] ?? 0) : all;
  const tabHref = (s?: string) => `/platform/workspaces?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { sub: s } : {}) })}`;
  return (
    <>
      <PageHeader title="Workspaces" description="Every company on the platform. Open one to see its plan, people and payments." />
      <nav aria-label="Filter by status" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[["", "All", all] as const, ...SUBS.map((k) => [k, subLabel(k), countOf[k] ?? 0] as const)].map(([k, label, n]) => (
          <Link key={k || "all"} href={tabHref(k)} aria-current={(sub ?? "") === k ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${(sub ?? "") === k ? "border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] font-semibold text-[var(--pf-accent)]" : "border-[var(--pf-border)] text-[var(--pf-muted)] hover:text-[var(--pf-text)]"}`}>
            {label}<span className="tabular-nums opacity-80">{n}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-3 flex items-center gap-2" action="/platform/workspaces" role="search">
        <label htmlFor="ws-q" className="sr-only">Search workspaces</label>
        <input id="ws-q" name="q" defaultValue={q} placeholder="Search name, code or owner email" className="input min-w-0 flex-1 sm:max-w-sm sm:flex-none" />
        {sub && <input type="hidden" name="sub" value={sub} />}
        <button className={buttonClass("secondary", "md")} type="submit" aria-label="Search"><Search className="size-4" aria-hidden /><span className="hidden sm:inline">Search</span></button>
        {adminCan(me.role, "tenants.export") && <a className={buttonClass("secondary", "md")} aria-label="Download CSV" title="Download CSV" href={`/api/platform/tenants-export?${new URLSearchParams({ ...(q ? { q } : {}), ...(sub ? { sub } : {}) })}`}><Download className="size-4" aria-hidden /><span className="hidden sm:inline">CSV</span></a>}
      </form>
      {(q || sub) && <div className="-mt-1 mb-3"><Link href="/platform/workspaces" className="text-[13px] text-[var(--pf-accent)] hover:underline">Clear filters</Link></div>}
      <SavedViews storageKey="workspaces" />
      {adminCan(me.role, "trials.manage") && <BulkBar><BulkExtendTrial /></BulkBar>}
      <div className="card overflow-hidden sm:hidden">
        <ul className="divide-y divide-[var(--pf-border)]">
          {rows.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3">
              {adminCan(me.role, "trials.manage") && (!t.isLegacy && t.subStatus === "TRIALING" ? <input type="checkbox" name="ids" value={t.id} aria-label={`Select ${t.name}`} className="mt-1 size-4 shrink-0" /> : <span className="size-4 shrink-0" aria-hidden />)}
              <Link href={`/platform/workspaces/${t.id}`} className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><span className="truncate font-medium text-[var(--pf-accent)]">{t.name}</span><Badge tone={SUB_TONE[t.subStatus]}>{subLabel(t.subStatus)}</Badge></span>
                <span className="mt-0.5 block truncate text-xs text-[var(--pf-muted)]">{t.ownerEmail ?? "No owner"}</span>
                <span className="mt-0.5 block text-xs text-[var(--pf-muted)]"><span className="capitalize">{t.planKey ?? "No plan"}</span> · Ends {fmtDate(t.subStatus === "TRIALING" ? t.trialEndsAt : t.currentPeriodEnd)}</span>
              </Link>
            </li>
          ))}
          {!rows.length && <li><EmptyState icon={Building2} title={q || sub ? "No workspaces match these filters" : "No workspaces yet"} description={q || sub ? "Try a different search or clear the filters." : "Companies appear here as soon as they sign up."} action={q || sub ? <Link href="/platform/workspaces" className="link text-sm">Clear filters</Link> : undefined} /></li>}
        </ul>
        <Pagination base="/platform/workspaces" params={{ q, sub, pageSize: sp.pageSize }} page={page} pageSize={pageSize} total={shown} />
      </div>
      <TableWrap className="max-sm:hidden" footer={<Pagination base="/platform/workspaces" params={{ q, sub, pageSize: sp.pageSize }} page={page} pageSize={pageSize} total={shown} />}>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-ink-500">
            <th className="w-8 px-4 py-2.5"><SelectAll label="Select all trials on this page" /></th><th className="px-4 py-2.5">Company</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Ends</th><th className="px-4 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5">{!t.isLegacy && t.subStatus === "TRIALING" && <input type="checkbox" name="ids" value={t.id} aria-label={`Select ${t.name}`} />}</td>
              <td className="px-4 py-2.5" data-label="Company"><Link href={`/platform/workspaces/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.name}</Link><div className="text-xs text-ink-500">{t.slug}{t.isLegacy ? " · original" : ""}{t.status !== "ACTIVE" ? ` · ${t.status.toLowerCase()}` : ""}</div></td>
              <td className="px-4 py-2.5" data-label="Owner">{t.ownerEmail ?? "—"}</td>
              <td className="px-4 py-2.5 capitalize" data-label="Plan">{t.planKey ?? "—"}</td>
              <td className="px-4 py-2.5" data-label="Status"><Badge tone={SUB_TONE[t.subStatus]}>{subLabel(t.subStatus)}</Badge></td>
              <td className="px-4 py-2.5" data-label="Ends">{fmtDate(t.subStatus === "TRIALING" ? t.trialEndsAt : t.currentPeriodEnd)}</td>
              <td className="px-4 py-2.5" data-label="Created">{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7}><EmptyState icon={Building2} title={q || sub ? "No workspaces match these filters" : "No workspaces yet"} description={q || sub ? "Try a different search or clear the filters." : "Companies appear here as soon as they sign up."} action={q || sub ? <Link href="/platform/workspaces" className="link text-sm">Clear filters</Link> : undefined} /></td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
