import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { SavedViews } from "@/components/platform/saved-views";
import { BulkExtendTrial } from "@/components/platform/bulk-trial";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { SUB_TONE } from "@/components/platform/tones";
import { tenantWhere } from "@/server/platform/tenant-list";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Workspaces" };

const SUBS = Object.keys(SUB_TONE);

export default async function Workspaces({ searchParams }: { searchParams: Promise<{ q?: string; sub?: string }> }) {
  const me = await requireAdminPage("tenants.view");
  const { q, sub } = await searchParams;
  const where = tenantWhere(q, sub);
  const [rows, counts] = await Promise.all([
    platformDb().tenant.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    platformDb().tenant.groupBy({ by: ["subStatus"], where: tenantWhere(q, undefined), _count: true }),
  ]);
  const countOf = Object.fromEntries(counts.map((c) => [c.subStatus, c._count])) as Record<string, number>;
  const all = counts.reduce((n, c) => n + c._count, 0);
  const tabHref = (s?: string) => `/platform/workspaces?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { sub: s } : {}) })}`;
  return (
    <>
      <PageHeader title="Workspaces" description="Every company on the platform. Open one to see its plan, people and payments." />
      <nav aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1.5">
        {[["", "All", all] as const, ...SUBS.map((k) => [k, k.toLowerCase().replace("_", " "), countOf[k] ?? 0] as const)].map(([k, label, n]) => (
          <Link key={k || "all"} href={tabHref(k)} aria-current={(sub ?? "") === k ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] capitalize ${(sub ?? "") === k ? "border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] font-semibold text-[var(--pf-accent)]" : "border-[var(--pf-border)] text-[var(--pf-muted)] hover:text-[var(--pf-text)]"}`}>
            {label}<span className="tabular-nums opacity-80">{n}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-3 flex flex-wrap items-end gap-2" action="/platform/workspaces" role="search">
        <div><label htmlFor="ws-q" className="label">Search</label><input id="ws-q" name="q" defaultValue={q} placeholder="Name, code or owner email" className="input w-72 max-w-full" /></div>
        {sub && <input type="hidden" name="sub" value={sub} />}
        <button className={buttonClass("secondary", "md")} type="submit">Search</button>
        {(q || sub) && <Link href="/platform/workspaces" className="self-center text-[13px] text-[var(--pf-accent)] hover:underline">Clear filters</Link>}
        {adminCan(me.role, "tenants.export") && <a className="link ml-auto self-center text-[13px]" href={`/api/platform/tenants-export?${new URLSearchParams({ ...(q ? { q } : {}), ...(sub ? { sub } : {}) })}`}>Download CSV</a>}
      </form>
      <SavedViews storageKey="workspaces" />
      {adminCan(me.role, "trials.manage") && <div className="mb-3"><BulkExtendTrial /></div>}
      <TableWrap>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-ink-500">
            <th className="w-8 px-4 py-2.5"><span className="sr-only">Select</span></th><th className="px-4 py-2.5">Company</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Ends</th><th className="px-4 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5">{!t.isLegacy && t.subStatus === "TRIALING" && <input type="checkbox" name="ids" value={t.id} aria-label={`Select ${t.name}`} />}</td>
              <td className="px-4 py-2.5"><Link href={`/platform/workspaces/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.name}</Link><div className="text-xs text-ink-500">{t.slug}{t.isLegacy ? " · original" : ""}{t.status !== "ACTIVE" ? ` · ${t.status.toLowerCase()}` : ""}</div></td>
              <td className="px-4 py-2.5">{t.ownerEmail ?? "—"}</td>
              <td className="px-4 py-2.5 capitalize">{t.planKey ?? "—"}</td>
              <td className="px-4 py-2.5"><Badge tone={SUB_TONE[t.subStatus]}>{t.subStatus.toLowerCase().replace("_", " ")}</Badge></td>
              <td className="px-4 py-2.5">{fmtDate(t.subStatus === "TRIALING" ? t.trialEndsAt : t.currentPeriodEnd)}</td>
              <td className="px-4 py-2.5">{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7}><EmptyState icon={Building2} title={q || sub ? "No workspaces match these filters" : "No workspaces yet"} description={q || sub ? "Try a different search or clear the filters." : "Companies appear here as soon as they sign up."} action={q || sub ? <Link href="/platform/workspaces" className="link text-sm">Clear filters</Link> : undefined} /></td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
