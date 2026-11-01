import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { QUOTATION_STATUS } from "@/lib/ops-constants";
import { isExpired } from "@/server/services/quotations";
import { fmtDate, fmtMoney, fullName } from "@/lib/utils";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const canCreate = can(user, "quotations.manage");
  const where: Prisma.QuotationWhereInput = {
    dealershipId,
    ...(p.status ? { status: p.status as "DRAFT" } : {}),
    ...(p.q
      ? { OR: [
          { customerName: { contains: p.q, mode: "insensitive" } },
          { contact: { OR: [{ firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { phone: { contains: p.q } }] } },
          ...(Number(p.q.replace(/\D/g, "")) ? [{ number: Number(p.q.replace(/\D/g, "")) }] : []),
        ] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.quotation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { contact: { select: { firstName: true, lastName: true } }, createdBy: { select: { name: true } } } }),
    db.quotation.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Quotations"
        description="Priced offers for your customers. Convert an accepted quotation into a customer order in one click."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Quotations" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {canCreate && <ButtonLink href="/portal/quotations/new"><Plus className="h-4 w-4" /> New quotation</ButtonLink>}
          </>
        }
      />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Customer, phone or quotation no." },
        { type: "select", name: "status", label: "Any status", options: Object.entries(QUOTATION_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/quotations" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Quotation</th><th className="th">Customer</th><th className="th text-right">Total</th><th className="th">Status</th><th className="th">Valid until</th><th className="th">Created by</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((q) => {
            const st = QUOTATION_STATUS[q.status]!;
            return (
              <tr key={q.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/portal/quotations/${q.id}`} className="link font-mono text-[13px]">QT-{q.number}</Link></td>
                <td className="td">{q.contact ? fullName(q.contact) : q.customerName ?? "—"}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(q.total.toString(), q.currency)}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge>{isExpired(q) && <Badge tone="red" className="ml-1">Expired</Badge>}</td>
                <td className="td whitespace-nowrap text-xs">{q.validUntil ? fmtDate(q.validUntil) : "—"}</td>
                <td className="td text-xs">{q.createdBy.name}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={FileText} title="No quotations yet" description="Send a customer a priced offer before they commit to an order." action={canCreate ? <ButtonLink href="/portal/quotations/new">New quotation</ButtonLink> : undefined} />
        </div>
      )}
    </>
  );
}
