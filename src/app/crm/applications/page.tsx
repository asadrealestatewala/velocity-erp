import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { FileCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";
import { APPLICATION_STATUS } from "@/lib/constants";

export const metadata = { title: "Dealership applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("applications.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams);
  const where: Prisma.DealershipApplicationWhereInput = {
    ...(p.status ? { status: p.status as "SUBMITTED" } : {}),
    ...(p.city ? { cityId: p.city } : {}),
    ...(p.reviewer ? { reviewerId: p.reviewer } : {}),
    ...(p.q ? { OR: [{ businessName: { contains: p.q, mode: "insensitive" } }, { firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { email: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, lk, reviewers, counts] = await Promise.all([
    db.dealershipApplication.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { city: { select: { name: true } }, province: { select: { name: true } }, reviewer: { select: { name: true } }, dealership: { select: { id: true, name: true } }, _count: { select: { documents: true } } } }),
    db.dealershipApplication.count({ where }),
    lookups(),
    db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permission: { key: "applications.review" } } } } }, select: { id: true, name: true } }),
    db.dealershipApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return (
    <>
      <PageHeader title="Dealership applications" description={`${count("SUBMITTED")} new · ${count("UNDER_REVIEW")} under review · ${count("INFO_REQUIRED")} awaiting information`} breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Applications" }]} />
      <FilterBar
        filters={[
          { type: "search", name: "q", label: "Search", placeholder: "Business or applicant…" },
          { type: "select", name: "status", label: "Any status", options: Object.entries(APPLICATION_STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
          { type: "select", name: "city", label: "Any city", options: opt(lk.cities) },
          { type: "select", name: "reviewer", label: "Any reviewer", options: opt(reviewers) },
        ]}
      />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={FileCheck2} title="No applications" description="Applications from /forms/dealership-application land here." /></div>
      ) : (
        <TableWrap footer={<Pagination base="/crm/applications" params={p} page={page} pageSize={pageSize} total={total} />}>
          <thead className="bg-ink-50/60">
            <tr><th className="th">#</th><th className="th">Business</th><th className="th">Applicant</th><th className="th">Location</th><th className="th text-right">Yrs</th><th className="th">OEM dealer</th><th className="th">Docs</th><th className="th">Status</th><th className="th">Reviewer</th><th className="th">Submitted</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/crm/applications/${a.id}`} className="link">#{a.number}</Link></td>
                <td className="td"><Link href={`/crm/applications/${a.id}`} className="link">{a.businessName}</Link>{a.dealership && <p className="text-xs text-emerald-700">→ {a.dealership.name}</p>}</td>
                <td className="td">{a.salutation} {a.firstName} {a.lastName}<p className="text-xs text-ink-400">{a.email}</p></td>
                <td className="td">{a.city?.name ?? "—"}<p className="text-xs text-ink-400">{a.province?.name}</p></td>
                <td className="td text-right tabular-nums">{a.yearsInBusiness}</td>
                <td className="td">{a.isOemDealer == null ? "—" : a.isOemDealer ? "Yes" : "No"}</td>
                <td className="td tabular-nums">{a._count.documents}</td>
                <td className="td"><Badge tone={APPLICATION_STATUS[a.status]!.tone}>{APPLICATION_STATUS[a.status]!.label}</Badge></td>
                <td className="td">{a.reviewer?.name ?? <span className="text-ink-400">Unassigned</span>}</td>
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
