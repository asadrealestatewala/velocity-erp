import { ShieldCheck } from "lucide-react";
import type { Prisma, WarrantyClaimStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { ClaimReviewButton } from "@/components/service/claim-controls";
import { WARRANTY_CLAIM_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Warranty claims" };

export default async function CentralWarrantyClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("warranty.review");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  // Drafts are the dealership's own work in progress; central staff only ever see submitted claims.
  const where: Prisma.WarrantyClaimWhereInput = {
    status: p.status && p.status in WARRANTY_CLAIM_STATUS && p.status !== "DRAFT" ? (p.status as WarrantyClaimStatus) : { not: "DRAFT" },
    ...(p.q ? { OR: [{ customerName: { contains: p.q, mode: "insensitive" } }, { plateNumber: { contains: p.q, mode: "insensitive" } }, { chassisNo: { contains: p.q, mode: "insensitive" } }, { dealership: { name: { contains: p.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.warrantyClaim.findMany({ where, orderBy: [{ status: "asc" }, { submittedAt: "asc" }], skip, take: pageSize, include: { dealership: { select: { name: true } }, jobCard: { select: { number: true } } } }),
    db.warrantyClaim.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Warranty claims" description="Claims submitted by dealerships for warranty work. Approve, reduce or reject each one." breadcrumbs={[{ label: "Warranty claims" }]} />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Dealership, customer, plate or chassis" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(WARRANTY_CLAIM_STATUS).filter(([v]) => v !== "DRAFT").map(([value, m]) => ({ value, label: m.label })) },
      ]} />
      <TableWrap footer={<Pagination base="/crm/warranty-claims" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Claim</th><th className="th">Dealership</th><th className="th">Customer / vehicle</th><th className="th">Failure</th><th className="th text-right">Claimed</th><th className="th text-right">Approved</th><th className="th">Status</th><th className="th text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((c) => {
            const st = WARRANTY_CLAIM_STATUS[c.status]!;
            return (
              <tr key={c.id}>
                <td className="td font-mono text-[13px]">WC-{c.number}<span className="block font-sans text-xs text-ink-500">JC-{c.jobCard.number} · {fmtDate(c.submittedAt)}</span></td>
                <td className="td text-sm">{c.dealership.name}</td>
                <td className="td text-sm">{c.customerName}<span className="block text-xs text-ink-500">{[c.vehicleLabel, c.plateNumber, c.chassisNo].filter(Boolean).join(" · ")}</span></td>
                <td className="td max-w-xs text-sm" title={c.failureDescription}><span className="line-clamp-2">{c.failureDescription}</span>{c.reviewNote && <span className="block text-xs text-ink-500">Note: {c.reviewNote}</span>}</td>
                <td className="td text-right tabular-nums">{fmtMoney(c.claimAmount.toString(), c.currency)}</td>
                <td className="td text-right tabular-nums">{c.approvedAmount ? fmtMoney(c.approvedAmount.toString(), c.currency) : "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td text-right">{c.status === "SUBMITTED" && <ClaimReviewButton id={c.id} claimAmount={Number(c.claimAmount)} currency={c.currency} />}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={ShieldCheck} title="No claims to review" description="Claims appear here when a dealership submits them." /></div>
      )}
    </>
  );
}
