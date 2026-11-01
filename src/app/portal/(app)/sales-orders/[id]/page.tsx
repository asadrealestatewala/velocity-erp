import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { findSalesOrder } from "@/server/services/sales-orders";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { SalesOrderActions } from "@/components/sales/order-actions";
import { IssueInvoiceButton } from "@/components/sales/invoice-actions";
import { INVENTORY_REASON, SALES_ORDER_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/utils";

export const metadata = { title: "Customer order" };

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const order = await findSalesOrder({ id, dealershipId: { in: dealershipIds(user) } });
  if (!order) notFound();
  const movements = await db.inventoryMovement.findMany({ where: { refType: "SalesOrder", refId: order.id }, orderBy: { createdAt: "asc" }, include: { item: { include: { bikeModel: true, product: true } } } });
  const st = SALES_ORDER_STATUS[order.status]!;
  const [invoice, quotation] = await Promise.all([
    db.invoice.findFirst({ where: { salesOrderId: order.id, status: { not: "VOID" } }, select: { id: true, number: true } }),
    db.quotation.findFirst({ where: { convertedOrderId: order.id }, select: { id: true, number: true } }),
  ]);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Order SO-{order.number} <Badge tone={st.tone}>{st.label}</Badge></span>}
        description={`Raised ${fmtDateTime(order.createdAt)} by ${order.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Customer orders", href: "/portal/sales-orders" }, { label: `SO-${order.number}` }]}
        actions={
          <>
            <ButtonLink href={`/api/sales-orders/${order.id}/pdf`} variant="secondary" download><Download className="h-4 w-4" /> PDF</ButtonLink>
            {invoice && <ButtonLink href={`/portal/invoices/${invoice.id}`} variant="secondary">Invoice INV-{invoice.number}</ButtonLink>}
            {!invoice && order.status === "CONFIRMED" && can(user, "invoices.manage") && <IssueInvoiceButton orderId={order.id} />}
            {can(user, "salesorders.manage") && <SalesOrderActions id={order.id} status={order.status} />}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Items" />
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Qty</th><th className="th text-right">Unit price</th><th className="th text-right">Line total</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="td font-medium text-ink-900">{l.name}</td>
                    <td className="td font-mono text-xs">{l.code ?? "—"}</td>
                    <td className="td text-right tabular-nums">{l.quantity}</td>
                    <td className="td text-right tabular-nums">{fmtMoney(l.unitPrice.toString(), order.currency)}</td>
                    <td className="td text-right font-medium tabular-nums">{fmtMoney(l.lineTotal.toString(), order.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink-200 text-sm">
                <tr><td colSpan={4} className="td text-right text-ink-500">Subtotal</td><td className="td text-right tabular-nums">{fmtMoney(order.subtotal.toString(), order.currency)}</td></tr>
                {Number(order.discount) > 0 && <tr><td colSpan={4} className="td text-right text-ink-500">Discount</td><td className="td text-right tabular-nums">− {fmtMoney(order.discount.toString(), order.currency)}</td></tr>}
                <tr><td colSpan={4} className="td text-right font-semibold text-ink-900">Total</td><td className="td text-right text-base font-bold tabular-nums">{fmtMoney(order.total.toString(), order.currency)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <DescriptionList cols={1} items={[
                { label: "Customer", value: order.contact ? <Link className="link" href={`/portal/contacts/${order.contact.id}`}>{fullName(order.contact)}</Link> : order.customerName ?? "—" },
                { label: "Phone", value: order.contact?.phone ?? "—" },
                { label: "Order date", value: fmtDate(order.orderDate) },
                { label: "Confirmed", value: order.confirmedAt ? `${fmtDateTime(order.confirmedAt)} by ${order.confirmedBy?.name ?? "—"}` : "Not yet" },
                ...(order.status === "CANCELLED" ? [{ label: "Cancelled", value: `${fmtDateTime(order.cancelledAt)}${order.cancelReason ? ` — ${order.cancelReason}` : ""}` }] : []),
                ...(quotation ? [{ label: "From quotation", value: <Link className="link" href={`/portal/quotations/${quotation.id}`}>QT-{quotation.number}</Link> }] : []),
                { label: "Notes", value: order.notes ?? "—" },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Stock impact" description="Changes this order made to your inventory" />
            <ul className="divide-y divide-ink-100 text-sm">
              {movements.length === 0 && <li className="px-5 py-4 text-ink-500">No stock has moved — a draft doesn&apos;t change inventory.</li>}
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span><span className="font-medium text-ink-900">{m.item.bikeModel?.name ?? m.item.product?.name}</span><span className="block text-xs text-ink-500">{INVENTORY_REASON[m.reason]} · {fmtDateTime(m.createdAt)}</span></span>
                  <Badge tone={m.delta < 0 ? "red" : "green"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
