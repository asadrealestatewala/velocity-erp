import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProcurementPage } from "@/server/authz";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { DispatchBadge, ExpectedDelivery, StatusBadge } from "@/components/procurement/order-parts";
import { DISPATCH_STATUS, PROCUREMENT_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Dealer orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireProcurementPage("procurement.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const digits = p.q ? Number(p.q.replace(/\D/g, "")) : 0;
  const where: Prisma.ProcurementOrderWhereInput = {
    ...(p.status ? { status: p.status as Prisma.EnumProcurementStatusFilter["equals"] } : {}),
    ...(p.dispatch ? { dispatchStatus: p.dispatch as Prisma.EnumDispatchStatusFilter["equals"] } : {}),
    ...(p.dealership ? { dealershipId: p.dealership } : {}),
    ...(p.overdue === "1" ? { status: "APPROVED" as const, expectedDeliveryDate: { lt: new Date(new Date().toDateString()) } } : {}),
    ...(p.from || p.to ? { submittedAt: { ...(p.from ? { gte: new Date(`${p.from}T00:00:00`) } : {}), ...(p.to ? { lte: new Date(`${p.to}T23:59:59`) } : {}) } } : {}),
    ...(p.q ? { OR: [...(digits ? [{ number: digits }] : []), { dealership: { name: { contains: p.q, mode: "insensitive" as const } } }, { trackingNumber: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, dealerships] = await Promise.all([
    db.procurementOrder.findMany({ where, orderBy: { submittedAt: "desc" }, skip, take: pageSize, include: { dealership: { select: { name: true, city: { select: { name: true } } } }, lines: { select: { quantity: true } } } }),
    db.procurementOrder.count({ where }),
    db.dealership.findMany({ where: { procurementOrders: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Dealer orders" description="Every stock order placed by dealerships, with delivery progress." breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Orders" }]} />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "PO no., dealership or tracking" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(PROCUREMENT_STATUS).map(([value, m]) => ({ value, label: m.label })) },
        { type: "select", name: "dispatch", label: "Any dispatch status", options: Object.entries(DISPATCH_STATUS).map(([value, m]) => ({ value, label: m.label })) },
        { type: "select", name: "dealership", label: "Any dealership", options: dealerships.map((d) => ({ value: d.id, label: d.name })) },
        { type: "select", name: "overdue", label: "All deliveries", options: [{ value: "1", label: "Overdue only" }] },
        { type: "daterange", from: "from", to: "to", label: "Placed", presets: true },
      ]} />
      <TableWrap footer={<Pagination base="/procurement/orders" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Dealership</th><th className="th">Placed</th><th className="th text-right">Units</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th">Dispatch</th><th className="th">Expected delivery</th><th className="th">Delivered</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-ink-50/50">
              <td className="td"><Link href={`/procurement/orders/${o.id}`} className="link font-mono text-[13px]">PO-{o.number}</Link>{o.priority === "URGENT" && <span className="ml-2 text-xs font-semibold text-red-600">Urgent</span>}</td>
              <td className="td"><p className="font-medium text-ink-900">{o.dealership.name}</p><p className="text-xs text-ink-500">{o.dealership.city.name}</p></td>
              <td className="td whitespace-nowrap text-xs">{fmtDate(o.submittedAt)}</td>
              <td className="td text-right tabular-nums">{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
              <td className="td text-right tabular-nums">{Number(o.subtotal) > 0 ? fmtMoney(o.subtotal.toString(), o.currency) : <span className="text-ink-400">TBC</span>}</td>
              <td className="td"><StatusBadge status={o.status} /></td>
              <td className="td"><DispatchBadge status={o.dispatchStatus} orderStatus={o.status} /></td>
              <td className="td whitespace-nowrap text-xs"><ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></td>
              <td className="td whitespace-nowrap text-xs">{o.deliveredAt ? fmtDate(o.deliveredAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={ClipboardList} title="No orders match" description="Try clearing the filters." /></div>
      )}
    </>
  );
}
