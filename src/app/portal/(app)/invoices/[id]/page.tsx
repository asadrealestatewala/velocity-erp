import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { findInvoice } from "@/server/services/invoices";
import { returnableByLine } from "@/server/services/returns";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { InvoiceActions } from "@/components/sales/invoice-actions";
import { INVOICE_STATUS, RETURN_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const inv = await findInvoice({ id, dealershipId: { in: dealershipIds(user) } });
  if (!inv) notFound();
  const avail = await returnableByLine(db, inv.id);
  const st = INVOICE_STATUS[inv.status]!;
  const cur = inv.currency;
  const refunded = inv.returns.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + Number(r.refundAmount), 0);
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Invoice INV-{inv.number} <Badge tone={st.tone}>{st.label}</Badge></span>}
        description={`Issued ${fmtDateTime(inv.createdAt)} by ${inv.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Invoices", href: "/portal/invoices" }, { label: `INV-${inv.number}` }]}
        actions={
          <>
            <ButtonLink href={`/api/invoices/${inv.id}/pdf`} variant="secondary" download><Download className="h-4 w-4" /> PDF</ButtonLink>
            <InvoiceActions id={inv.id} status={inv.status} canManage={can(user, "invoices.manage")} canReturn={can(user, "returns.manage")} lines={avail.map((a) => ({ id: a.line.id, name: a.line.name, available: a.available }))} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Qty</th><th className="th text-right">Unit price</th><th className="th text-right">Line total</th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="td font-medium text-ink-900">{l.name}</td>
                      <td className="td font-mono text-xs">{l.code ?? "—"}</td>
                      <td className="td text-right tabular-nums">{l.quantity}</td>
                      <td className="td text-right tabular-nums">{fmtMoney(l.unitPrice.toString(), cur)}</td>
                      <td className="td text-right font-medium tabular-nums">{fmtMoney(l.lineTotal.toString(), cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-ink-200 text-sm">
                  <tr><td colSpan={4} className="td text-right text-ink-500">Subtotal</td><td className="td text-right tabular-nums">{fmtMoney(inv.subtotal.toString(), cur)}</td></tr>
                  {Number(inv.discount) > 0 && <tr><td colSpan={4} className="td text-right text-ink-500">Discount</td><td className="td text-right tabular-nums">− {fmtMoney(inv.discount.toString(), cur)}</td></tr>}
                  <tr><td colSpan={4} className="td text-right text-ink-500">Sales tax ({Number(inv.taxRate)}%)</td><td className="td text-right tabular-nums">{fmtMoney(inv.taxAmount.toString(), cur)}</td></tr>
                  <tr><td colSpan={4} className="td text-right font-semibold text-ink-900">Total</td><td className="td text-right text-base font-bold tabular-nums">{fmtMoney(inv.total.toString(), cur)}</td></tr>
                  {refunded > 0 && <tr><td colSpan={4} className="td text-right text-ink-500">Refunded</td><td className="td text-right tabular-nums">− {fmtMoney(refunded, cur)}</td></tr>}
                </tfoot>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Returns & refunds" description="Goods the customer sent back against this invoice" />
            <ul className="divide-y divide-ink-100 text-sm">
              {inv.returns.length === 0 && <li className="px-5 py-4 text-ink-500">No returns.</li>}
              {inv.returns.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span><Link className="link font-mono" href={`/portal/returns/${r.id}`}>RET-{r.number}</Link><span className="block text-xs text-ink-500">{r.reason} · {fmtDate(r.createdAt)} · {r.createdBy.name}</span></span>
                  <span className="flex items-center gap-3"><span className="tabular-nums">{fmtMoney(r.refundAmount.toString(), cur)}</span><Badge tone={RETURN_STATUS[r.status]!.tone}>{RETURN_STATUS[r.status]!.label}</Badge></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Seller" />
            <div className="p-5"><DescriptionList cols={1} items={[{ label: "Name", value: inv.sellerName }, { label: "NTN", value: inv.sellerNtn ?? "Not set" }, { label: "STRN", value: inv.sellerStrn ?? "Not set" }, { label: "Address", value: inv.sellerAddress ?? "—" }]} /></div>
          </Card>
          <Card>
            <CardHeader title="Buyer" />
            <div className="p-5"><DescriptionList cols={1} items={[{ label: "Name", value: inv.buyerName }, { label: "NTN", value: inv.buyerNtn ?? "—" }, { label: "CNIC", value: inv.buyerCnic ?? "—" }, { label: "Address", value: inv.buyerAddress ?? "—" }, { label: "Phone", value: inv.buyerPhone ?? "—" }]} /></div>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <div className="p-5"><DescriptionList cols={1} items={[
              { label: "Order", value: <Link className="link" href={`/portal/sales-orders/${inv.salesOrder.id}`}>SO-{inv.salesOrder.number}</Link> },
              { label: "Invoice date", value: fmtDate(inv.invoiceDate) },
              { label: "Due date", value: inv.dueDate ? fmtDate(inv.dueDate) : "—" },
              ...(inv.paidAt ? [{ label: "Paid", value: `${fmtDateTime(inv.paidAt)} · ${inv.paymentMethod}` }] : []),
              ...(inv.status === "VOID" ? [{ label: "Voided", value: `${fmtDateTime(inv.voidedAt)}${inv.voidReason ? ` — ${inv.voidReason}` : ""}` }] : []),
              { label: "Notes", value: inv.notes ?? "—" },
            ]} /></div>
          </Card>
        </div>
      </div>
    </>
  );
}
