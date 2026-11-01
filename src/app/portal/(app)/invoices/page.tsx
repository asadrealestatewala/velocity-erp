import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { INVOICE_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { CircleDollarSign, Receipt } from "lucide-react";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const where: Prisma.InvoiceWhereInput = {
    dealershipId,
    ...(p.status ? { status: p.status as "ISSUED" } : {}),
    ...(p.q
      ? { OR: [
          { buyerName: { contains: p.q, mode: "insensitive" } },
          { buyerNtn: { contains: p.q } },
          ...(Number(p.q.replace(/\D/g, "")) ? [{ number: Number(p.q.replace(/\D/g, "")) }] : []),
        ] }
      : {}),
  };
  const [rows, total, unpaid] = await Promise.all([
    db.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { salesOrder: { select: { number: true } } } }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where: { dealershipId, status: "ISSUED" }, _sum: { total: true }, _count: true }),
  ]);
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Tax invoices raised for confirmed customer orders. Issue one from the order's page."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Invoices" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Unpaid invoices" value={unpaid._count} icon={Receipt} tone="amber" />
        <StatCard label="Outstanding amount" value={fmtMoney(unpaid._sum.total?.toString() ?? 0)} icon={CircleDollarSign} tone="blue" />
      </div>
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Buyer, NTN or invoice no." },
        { type: "select", name: "status", label: "Any status", options: Object.entries(INVOICE_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/invoices" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Invoice</th><th className="th">Buyer</th><th className="th">Buyer NTN</th><th className="th text-right">Tax</th><th className="th text-right">Total</th><th className="th">Status</th><th className="th">Date</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((i) => {
            const st = INVOICE_STATUS[i.status]!;
            return (
              <tr key={i.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/portal/invoices/${i.id}`} className="link font-mono text-[13px]">INV-{i.number}</Link><span className="block text-xs text-ink-500">SO-{i.salesOrder.number}</span></td>
                <td className="td">{i.buyerName}</td>
                <td className="td font-mono text-xs">{i.buyerNtn ?? i.buyerCnic ?? "—"}</td>
                <td className="td text-right tabular-nums">{fmtMoney(i.taxAmount.toString(), i.currency)}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(i.total.toString(), i.currency)}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(i.invoiceDate)}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={FileCheck2} title="No invoices yet" description="Open a confirmed customer order and choose Issue invoice." />
        </div>
      )}
    </>
  );
}
