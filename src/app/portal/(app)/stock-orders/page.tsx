import Link from "next/link";
import { CheckCircle2, ClipboardList, PackageCheck, Truck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { procurementStats } from "@/server/services/procurement";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { DispatchBadge, ExpectedDelivery, StatusBadge } from "@/components/procurement/order-parts";
import { PROCUREMENT_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Stock orders" };

export default async function StockOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("procurement.order");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;

  const where: Prisma.ProcurementOrderWhereInput = {
    dealershipId,
    ...(p.status ? { status: p.status as Prisma.EnumProcurementStatusFilter["equals"] } : {}),
    ...(p.q && Number(p.q.replace(/\D/g, "")) ? { number: Number(p.q.replace(/\D/g, "")) } : {}),
  };
  const [stats, rows, total] = await Promise.all([
    procurementStats(dealershipId),
    db.procurementOrder.findMany({ where, orderBy: { submittedAt: "desc" }, skip, take: pageSize, include: { lines: { select: { quantity: true } } } }),
    db.procurementOrder.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Stock orders"
        description="Order bikes and spare parts from YADEA procurement and track each delivery."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock orders" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            <ButtonLink href="/portal/stock-orders/new">New stock order</ButtonLink>
          </>
        }
      />
      {stats.awaitingReceipt > 0 && can(user, "procurement.order") && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{stats.awaitingReceipt}</b> {stats.awaitingReceipt === 1 ? "delivery is" : "deliveries are"} waiting for you to confirm receipt. Open the order and confirm what arrived so your stock updates.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders placed" value={stats.total} icon={ClipboardList} />
        <StatCard label="Awaiting approval" value={stats.received} icon={ClipboardList} tone="blue" />
        <StatCard label="Being delivered" value={stats.approved} icon={Truck} tone="violet" hint={`${stats.dispatched + stats.inTransit} on the road`} />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} tone="green" hint={stats.awaitingReceipt ? `${stats.awaitingReceipt} to confirm` : undefined} />
      </div>
      <FilterBar filters={[
        { type: "search", name: "q", label: "Order no.", placeholder: "Order number" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(PROCUREMENT_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/stock-orders" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Placed</th><th className="th text-right">Units</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th">Dispatch</th><th className="th">Expected delivery</th><th className="th">Delivered</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-ink-50/50">
              <td className="td">
                <Link href={`/portal/stock-orders/${o.id}`} className="link font-mono text-[13px]">PO-{o.number}</Link>
                {o.priority === "URGENT" && <span className="ml-2 text-xs font-semibold text-red-600">Urgent</span>}
              </td>
              <td className="td whitespace-nowrap text-xs">{fmtDate(o.submittedAt)}</td>
              <td className="td text-right tabular-nums">{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
              <td className="td text-right tabular-nums">{Number(o.subtotal) > 0 ? fmtMoney(o.subtotal.toString(), o.currency) : <span className="text-ink-400">TBC</span>}</td>
              <td className="td"><StatusBadge status={o.status} />{o.status === "DELIVERED" && !o.receivedById && <span className="ml-2 text-xs font-semibold text-amber-700">Confirm receipt</span>}</td>
              <td className="td"><DispatchBadge status={o.dispatchStatus} orderStatus={o.status} /></td>
              <td className="td whitespace-nowrap text-xs"><ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></td>
              <td className="td whitespace-nowrap text-xs">{o.deliveredAt ? fmtDate(o.deliveredAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={PackageCheck} title="No stock orders yet" description="Order bikes or spare parts from YADEA when your stock runs low." action={<ButtonLink href="/portal/stock-orders/new">New stock order</ButtonLink>} />
        </div>
      )}
    </>
  );
}
