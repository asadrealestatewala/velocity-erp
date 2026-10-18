import Link from "next/link";
import { Truck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { TableWrap, parseListParams } from "@/components/ui/table";
import { DispatchBadge, ExpectedDelivery } from "@/components/procurement/order-parts";
import { DispatchDialog } from "@/components/procurement/order-controls";
import { DISPATCH_STATUS } from "@/lib/ops-constants";
import { fmtDate, isoDay } from "@/lib/utils";

export const metadata = { title: "Dispatch & delivery" };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage("procurement.view");
  const { flat: p } = parseListParams(await searchParams);
  const today = new Date(new Date().toDateString());
  const where: Prisma.ProcurementOrderWhereInput = {
    status: "APPROVED",
    ...(p.dispatch ? { dispatchStatus: p.dispatch as Prisma.EnumDispatchStatusFilter["equals"] } : {}),
    ...(p.overdue === "1" ? { expectedDeliveryDate: { lt: today } } : {}),
  };
  const rows = await db.procurementOrder.findMany({
    where,
    orderBy: [{ expectedDeliveryDate: { sort: "asc", nulls: "last" } }, { submittedAt: "asc" }],
    include: { dealership: { select: { name: true, city: { select: { name: true } } } }, lines: { select: { quantity: true } } },
  });
  const manage = can(user, "procurement.manage");
  return (
    <>
      <PageHeader title="Dispatch & delivery" description="Approved orders that are still on their way to the dealership. Update each step so dealers can track their delivery." breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Dispatch" }]} />
      <FilterBar filters={[
        { type: "select", name: "dispatch", label: "Any dispatch status", options: Object.entries(DISPATCH_STATUS).filter(([k]) => k !== "DELIVERED").map(([value, m]) => ({ value, label: m.label })) },
        { type: "select", name: "overdue", label: "All deliveries", options: [{ value: "1", label: "Overdue only" }] },
      ]} />
      <TableWrap>
        <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Dealership</th><th className="th text-right">Units</th><th className="th">Dispatch status</th><th className="th">Expected delivery</th><th className="th">Dispatched</th><th className="th">Courier / tracking</th>{manage && <th className="th"><span className="sr-only">Update</span></th>}</tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-ink-50/50">
              <td className="td"><Link href={`/procurement/orders/${o.id}`} className="link font-mono text-[13px]">PO-{o.number}</Link>{o.priority === "URGENT" && <span className="ml-2 text-xs font-semibold text-red-600">Urgent</span>}</td>
              <td className="td"><p className="font-medium text-ink-900">{o.dealership.name}</p><p className="text-xs text-ink-500">{o.dealership.city.name}</p></td>
              <td className="td text-right tabular-nums">{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
              <td className="td"><DispatchBadge status={o.dispatchStatus} /></td>
              <td className="td whitespace-nowrap text-xs"><ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></td>
              <td className="td whitespace-nowrap text-xs">{o.dispatchedAt ? fmtDate(o.dispatchedAt) : "—"}</td>
              <td className="td text-xs">{o.courier ?? "—"}{o.trackingNumber && <span className="block font-mono text-ink-500">{o.trackingNumber}</span>}</td>
              {manage && (
                <td className="td text-right">
                  <DispatchDialog orderId={o.id} number={o.number} current={o.dispatchStatus} expectedDate={o.expectedDeliveryDate ? isoDay(o.expectedDeliveryDate) : undefined} courier={o.courier} trackingNumber={o.trackingNumber} label="Update" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length === 0 && <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={Truck} title="No open shipments" description="Approved orders awaiting packing, dispatch or delivery appear here." /></div>}
    </>
  );
}
