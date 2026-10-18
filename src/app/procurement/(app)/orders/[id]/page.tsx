import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { orderInclude } from "@/server/services/procurement";
import { dealerBalance } from "@/server/services/ledger";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ApproveOrderDialog, DispatchDialog, RejectOrderDialog } from "@/components/procurement/order-controls";
import { DispatchBadge, ExpectedDelivery, OrderHistory, OrderLines, OrderTracker, StatusBadge } from "@/components/procurement/order-parts";
import { LEDGER_STATUS, LEDGER_TYPE } from "@/lib/ops-constants";
import { fmtDate, fmtDateTime, fmtMoney, isoDay } from "@/lib/utils";

export const metadata = { title: "Dealer order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireProcurementPage("procurement.view");
  const { id } = await params;
  const order = await db.procurementOrder.findUnique({ where: { id }, include: orderInclude });
  if (!order) notFound();
  const manage = can(user, "procurement.manage");
  const seeLedger = can(user, "ledger.view");
  const [entries, balance] = await Promise.all([
    seeLedger ? db.ledgerEntry.findMany({ where: { orderId: order.id }, orderBy: { entryDate: "asc" } }) : Promise.resolve([]),
    seeLedger ? dealerBalance(order.dealershipId) : Promise.resolve(null),
  ]);
  const inProgress = order.status === "APPROVED";

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Order PO-{order.number} <StatusBadge status={order.status} /><DispatchBadge status={order.dispatchStatus} orderStatus={order.status} /></span>}
        description={<>From <Link className="link" href={`/procurement/dealers/${order.dealership.id}`}>{order.dealership.name}</Link> · placed {fmtDateTime(order.submittedAt)} by {order.requestedBy.name}{order.priority === "URGENT" ? " · Urgent" : ""}</>}
        breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Orders", href: "/procurement/orders" }, { label: `PO-${order.number}` }]}
        actions={
          <>
            {order.invoiceEntryId && seeLedger && <ButtonLink href={`/api/procurement/${order.id}/invoice`} variant="secondary" download><Download className="h-4 w-4" /> Invoice (PDF)</ButtonLink>}
            {manage && order.status === "SUBMITTED" && (
              <>
                <RejectOrderDialog orderId={order.id} number={order.number} />
                <ApproveOrderDialog orderId={order.id} number={order.number} currency={order.currency} lines={order.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, unitPrice: Number(l.unitPrice) }))} />
              </>
            )}
            {manage && inProgress && (
              <>
                {["NOT_DISPATCHED", "PACKING"].includes(order.dispatchStatus) && <RejectOrderDialog orderId={order.id} number={order.number} />}
                <DispatchDialog
                  orderId={order.id}
                  number={order.number}
                  current={order.dispatchStatus}
                  expectedDate={order.expectedDeliveryDate ? isoDay(order.expectedDeliveryDate) : undefined}
                  courier={order.courier}
                  trackingNumber={order.trackingNumber}
                />
              </>
            )}
          </>
        }
      />
      {order.status === "REJECTED" && order.rejectionReason && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>Rejected:</b> {order.rejectionReason}</p>}
      {order.status === "DELIVERED" && !order.receivedById && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Delivered on {fmtDate(order.deliveredAt)} — waiting for {order.dealership.name} to confirm what they received.</p>}
      <Card className="mb-6"><div className="px-5 py-6"><OrderTracker status={order.status} dispatchStatus={order.dispatchStatus} /></div></Card>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card><CardHeader title="Items" /><OrderLines lines={order.lines} currency={order.currency} subtotal={order.subtotal} showReceived={!!order.receivedById} /></Card>
          <Card><CardHeader title="History" /><OrderHistory rows={order.history} /></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery" />
            <div className="p-5">
              <DescriptionList cols={1} items={[
                { label: "Dispatch status", value: <DispatchBadge status={order.dispatchStatus} orderStatus={order.status} /> },
                { label: "Expected delivery", value: <ExpectedDelivery date={order.expectedDeliveryDate} status={order.status} /> },
                { label: "Dispatched on", value: order.dispatchedAt ? fmtDate(order.dispatchedAt) : "—" },
                { label: "Delivered on", value: order.deliveredAt ? fmtDate(order.deliveredAt) : "—" },
                { label: "Courier", value: order.courier ?? "—" },
                { label: "Tracking number", value: order.trackingNumber ?? "—" },
                { label: "Receipt confirmed by", value: order.receivedBy?.name ?? "—" },
                { label: "Handled by", value: order.handledBy?.name ?? "—" },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Dealership notes" />
            <div className="space-y-3 p-5 text-sm">
              <div><p className="text-[13px] font-medium text-ink-500">From the dealership</p><p className="text-ink-800">{order.dealerNotes ?? "—"}</p></div>
              <div><p className="text-[13px] font-medium text-ink-500">Internal (YADEA only)</p><p className="text-ink-800">{order.internalNotes ?? "—"}</p></div>
            </div>
          </Card>
          {seeLedger && (
            <Card>
              <CardHeader title="Account" description={balance ? `Dealer balance: ${fmtMoney(balance.balance)}` : undefined} action={<Link className="text-sm font-medium text-brand-600 hover:underline" href={`/procurement/dealers/${order.dealership.id}?tab=ledger`}>Ledger</Link>} />
              <ul className="divide-y divide-ink-100 text-sm">
                {entries.length === 0 && <li className="px-5 py-4 text-ink-500">No ledger entries for this order yet — the invoice is raised on dispatch.</li>}
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span><span className="font-medium text-ink-900">{LEDGER_TYPE[e.type]?.label}</span><span className="block text-xs text-ink-500">{fmtDate(e.entryDate)}</span></span>
                    <span className="text-right"><span className="block font-medium tabular-nums">{fmtMoney((Number(e.debit) || Number(e.credit)).toString(), e.currency)}</span><Badge tone={LEDGER_STATUS[e.status]?.tone}>{LEDGER_STATUS[e.status]?.label}</Badge></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
