import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { can, dealershipIds, requirePortalPage } from "@/server/authz";
import { orderInclude } from "@/server/services/procurement";
import { Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { CancelStockOrderButton, ConfirmReceiptDialog } from "@/components/procurement/dealer-order-actions";
import { DispatchBadge, ExpectedDelivery, OrderHistory, OrderLines, OrderTracker, StatusBadge } from "@/components/procurement/order-parts";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Stock order" };

export default async function StockOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("procurement.order");
  const { id } = await params;
  const order = await db.procurementOrder.findFirst({ where: { id, dealershipId: { in: dealershipIds(user) } }, include: orderInclude });
  if (!order) notFound();
  const awaitingReceipt = order.status === "DELIVERED" && !order.receivedById;
  const invoice = order.invoiceEntryId ? await db.ledgerEntry.findUnique({ where: { id: order.invoiceEntryId } }) : null;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Stock order PO-{order.number} <StatusBadge status={order.status} /></span>}
        description={`Placed ${fmtDateTime(order.submittedAt)} by ${order.requestedBy.name}${order.priority === "URGENT" ? " · Urgent" : ""}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock orders", href: "/portal/stock-orders" }, { label: `PO-${order.number}` }]}
        actions={
          <>
            {invoice && can(user, "ledger.view") && <ButtonLink href={`/api/procurement/${order.id}/invoice`} variant="secondary" download><Download className="h-4 w-4" /> Invoice (PDF)</ButtonLink>}
            {order.status === "SUBMITTED" && can(user, "procurement.order") && <CancelStockOrderButton orderId={order.id} number={order.number} />}
            {awaitingReceipt && can(user, "procurement.order") && <ConfirmReceiptDialog orderId={order.id} number={order.number} lines={order.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity }))} />}
          </>
        }
      />
      {awaitingReceipt && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This order was delivered on <b>{fmtDate(order.deliveredAt)}</b>. Confirm what arrived to add it to your showroom inventory.</p>
      )}
      {order.status === "REJECTED" && order.rejectionReason && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>Not approved:</b> {order.rejectionReason}</p>
      )}
      <Card className="mb-6">
        <div className="px-5 py-6"><OrderTracker status={order.status} dispatchStatus={order.dispatchStatus} /></div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <OrderLines lines={order.lines} currency={order.currency} subtotal={order.subtotal} showReceived={!!order.receivedById} />
          </Card>
          <Card>
            <CardHeader title="History" />
            <OrderHistory rows={order.history} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery" />
            <div className="p-5">
              <DescriptionList cols={1} items={[
                { label: "Status", value: <StatusBadge status={order.status} /> },
                { label: "Dispatch status", value: <DispatchBadge status={order.dispatchStatus} orderStatus={order.status} /> },
                { label: "Expected delivery", value: <ExpectedDelivery date={order.expectedDeliveryDate} status={order.status} /> },
                { label: "Dispatched on", value: order.dispatchedAt ? fmtDate(order.dispatchedAt) : "—" },
                { label: "Delivered on", value: order.deliveredAt ? fmtDate(order.deliveredAt) : "—" },
                { label: "Courier", value: order.courier ?? "—" },
                { label: "Tracking number", value: order.trackingNumber ?? "—" },
                { label: "Receipt confirmed", value: order.receivedBy ? `${order.receivedBy.name}` : "—" },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Account" />
            <div className="p-5">
              <DescriptionList cols={1} items={[
                { label: "Order value", value: Number(order.subtotal) > 0 ? fmtMoney(order.subtotal.toString(), order.currency) : "To be confirmed" },
                { label: "Invoice", value: invoice ? `Raised ${fmtDate(invoice.entryDate)} (${fmtMoney(invoice.debit.toString(), invoice.currency)})` : "Raised when the order is dispatched" },
                { label: "Your notes", value: order.dealerNotes ?? "—" },
              ]} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
