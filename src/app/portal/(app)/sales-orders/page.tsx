import Link from "next/link";
import { ClipboardList, Plus, ReceiptText, TrendingUp } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { SALES_ORDER_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney, fullName } from "@/lib/utils";
import { startOfMonth } from "date-fns";

export const metadata = { title: "Customer orders" };

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const canSell = can(user, "salesorders.manage");

  const where: Prisma.SalesOrderWhereInput = {
    dealershipId,
    ...(p.status ? { status: p.status as "DRAFT" | "CONFIRMED" | "CANCELLED" } : {}),
    ...(p.q
      ? { OR: [
          { customerName: { contains: p.q, mode: "insensitive" } },
          { contact: { OR: [{ firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { phone: { contains: p.q } }] } },
          ...(Number(p.q.replace(/\D/g, "")) ? [{ number: Number(p.q.replace(/\D/g, "")) }] : []),
        ] }
      : {}),
  };
  const monthStart = startOfMonth(new Date());
  const [rows, total, monthAgg, drafts] = await Promise.all([
    db.salesOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { contact: { select: { firstName: true, lastName: true } }, lines: { select: { quantity: true } }, createdBy: { select: { name: true } } } }),
    db.salesOrder.count({ where }),
    db.salesOrder.aggregate({ where: { dealershipId, status: "CONFIRMED", confirmedAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    db.salesOrder.count({ where: { dealershipId, status: "DRAFT" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Customer orders"
        description="Purchase orders raised for your customers. Confirming an order deducts the items from your showroom inventory."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Customer orders" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {canSell && <ButtonLink href="/portal/sales-orders/new"><Plus className="h-4 w-4" /> New order</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Confirmed this month" value={monthAgg._count} icon={ReceiptText} tone="green" />
        <StatCard label="Sales value this month" value={fmtMoney(monthAgg._sum.total?.toString() ?? 0)} icon={TrendingUp} tone="blue" />
        <StatCard label="Drafts awaiting confirmation" value={drafts} icon={ClipboardList} tone="amber" />
      </div>
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Customer, phone or order no." },
        { type: "select", name: "status", label: "Any status", options: Object.entries(SALES_ORDER_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/sales-orders" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Customer</th><th className="th text-right">Items</th><th className="th text-right">Total</th><th className="th">Status</th><th className="th">Date</th><th className="th">Created by</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((o) => {
            const st = SALES_ORDER_STATUS[o.status]!;
            return (
              <tr key={o.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/portal/sales-orders/${o.id}`} className="link font-mono text-[13px]">SO-{o.number}</Link></td>
                <td className="td">{o.contact ? fullName(o.contact) : o.customerName ?? "—"}</td>
                <td className="td text-right tabular-nums">{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(o.total.toString(), o.currency)}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(o.orderDate)}</td>
                <td className="td text-xs">{o.createdBy.name}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={ClipboardList} title="No orders yet" description={canSell ? "Create an order when a customer buys a bike or spare parts — your stock updates automatically." : "Orders raised by your team will appear here."} action={canSell ? <ButtonLink href="/portal/sales-orders/new">New order</ButtonLink> : undefined} />
        </div>
      )}
    </>
  );
}
