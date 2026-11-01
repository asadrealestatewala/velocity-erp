import Link from "next/link";
import { Undo2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { RETURN_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Returns & refunds" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const where: Prisma.SalesReturnWhereInput = {
    dealershipId,
    ...(p.status ? { status: p.status as "PENDING" } : {}),
    ...(p.q && Number(p.q.replace(/\D/g, "")) ? { OR: [{ number: Number(p.q.replace(/\D/g, "")) }, { invoice: { number: Number(p.q.replace(/\D/g, "")) } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.salesReturn.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { invoice: { select: { number: true, buyerName: true } }, createdBy: { select: { name: true } } } }),
    db.salesReturn.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Returns & refunds"
        description="Customer returns against invoices. Raise one from the invoice; a manager approves it to restock and refund."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Returns & refunds" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Return or invoice no." },
        { type: "select", name: "status", label: "Any status", options: Object.entries(RETURN_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/returns" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Return</th><th className="th">Invoice</th><th className="th">Customer</th><th className="th text-right">Refund</th><th className="th">Status</th><th className="th">Date</th><th className="th">Raised by</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((r) => {
            const st = RETURN_STATUS[r.status]!;
            return (
              <tr key={r.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/portal/returns/${r.id}`} className="link font-mono text-[13px]">RET-{r.number}</Link></td>
                <td className="td"><Link href={`/portal/invoices/${r.invoiceId}`} className="link font-mono text-[13px]">INV-{r.invoice.number}</Link></td>
                <td className="td">{r.invoice.buyerName}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(r.refundAmount.toString(), r.currency)}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
                <td className="td text-xs">{r.createdBy.name}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={Undo2} title="No returns" description="Returns you record against an invoice appear here." />
        </div>
      )}
    </>
  );
}
