import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { Prisma, WarrantyClaimStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { ClaimDealerActions } from "@/components/service/claim-controls";
import { WARRANTY_CLAIM_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Warranty claims" };

export default async function WarrantyClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("service.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const canManage = can(user, "warranty.manage");
  const where: Prisma.WarrantyClaimWhereInput = {
    dealershipId,
    ...(p.status && p.status in WARRANTY_CLAIM_STATUS ? { status: p.status as WarrantyClaimStatus } : {}),
    ...(p.q ? { OR: [{ customerName: { contains: p.q, mode: "insensitive" } }, { plateNumber: { contains: p.q, mode: "insensitive" } }, { chassisNo: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.warrantyClaim.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { jobCard: { select: { id: true, number: true, status: true } } } }),
    db.warrantyClaim.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Warranty claims"
        description="Reimbursement requests to YADEA for warranty work. Raise a claim from a warranty job card."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service", href: "/portal/service" }, { label: "Warranty claims" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Customer, plate or chassis" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(WARRANTY_CLAIM_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/warranty" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Claim</th><th className="th">Job</th><th className="th">Customer / vehicle</th><th className="th">Failure</th><th className="th text-right">Claimed</th><th className="th text-right">Approved</th><th className="th">Status</th><th className="th text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((c) => {
            const st = WARRANTY_CLAIM_STATUS[c.status]!;
            return (
              <tr key={c.id}>
                <td className="td font-mono text-[13px]">WC-{c.number}<span className="block font-sans text-xs text-ink-500">{fmtDate(c.submittedAt ?? c.createdAt)}</span></td>
                <td className="td"><Link className="link font-mono text-[13px]" href={`/portal/service/${c.jobCard.id}`}>JC-{c.jobCard.number}</Link></td>
                <td className="td text-sm">{c.customerName}<span className="block text-xs text-ink-500">{[c.vehicleLabel, c.plateNumber, c.chassisNo].filter(Boolean).join(" · ")}</span></td>
                <td className="td max-w-xs truncate text-sm" title={c.failureDescription}>{c.failureDescription}{c.reviewNote && <span className="block text-xs text-ink-500">YADEA: {c.reviewNote}</span>}</td>
                <td className="td text-right tabular-nums">{fmtMoney(c.claimAmount.toString(), c.currency)}</td>
                <td className="td text-right tabular-nums">{c.approvedAmount ? fmtMoney(c.approvedAmount.toString(), c.currency) : "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td">{canManage && <ClaimDealerActions id={c.id} status={c.status} jobReady={c.jobCard.status === "COMPLETED" || c.jobCard.status === "DELIVERED"} />}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={ShieldCheck} title="No warranty claims" description="Mark a job card as a warranty job, then raise a claim from it." />
        </div>
      )}
    </>
  );
}
