import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { findQuotation, isExpired } from "@/server/services/quotations";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { QuotationActions } from "@/components/sales/quotation-actions";
import { QUOTATION_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/utils";
import { db } from "@/lib/db";

export const metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const q = await findQuotation({ id, dealershipId: { in: dealershipIds(user) } });
  if (!q) notFound();
  const order = q.convertedOrderId ? await db.salesOrder.findUnique({ where: { id: q.convertedOrderId }, select: { id: true, number: true } }) : null;
  const st = QUOTATION_STATUS[q.status]!;
  const expired = isExpired(q);
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Quotation QT-{q.number} <Badge tone={st.tone}>{st.label}</Badge>{expired && <Badge tone="red">Expired</Badge>}</span>}
        description={`Prepared ${fmtDateTime(q.createdAt)} by ${q.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Quotations", href: "/portal/quotations" }, { label: `QT-${q.number}` }]}
        actions={
          <>
            <ButtonLink href={`/api/quotations/${q.id}/pdf`} variant="secondary" download><Download className="h-4 w-4" /> PDF</ButtonLink>
            {can(user, "quotations.manage") && <QuotationActions id={q.id} status={q.status} expired={expired} canConvert={can(user, "salesorders.manage")} />}
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
                {q.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="td font-medium text-ink-900">{l.name}</td>
                    <td className="td font-mono text-xs">{l.code ?? "—"}</td>
                    <td className="td text-right tabular-nums">{l.quantity}</td>
                    <td className="td text-right tabular-nums">{fmtMoney(l.unitPrice.toString(), q.currency)}</td>
                    <td className="td text-right font-medium tabular-nums">{fmtMoney(l.lineTotal.toString(), q.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink-200 text-sm">
                <tr><td colSpan={4} className="td text-right text-ink-500">Subtotal</td><td className="td text-right tabular-nums">{fmtMoney(q.subtotal.toString(), q.currency)}</td></tr>
                {Number(q.discount) > 0 && <tr><td colSpan={4} className="td text-right text-ink-500">Discount</td><td className="td text-right tabular-nums">− {fmtMoney(q.discount.toString(), q.currency)}</td></tr>}
                <tr><td colSpan={4} className="td text-right font-semibold text-ink-900">Total</td><td className="td text-right text-base font-bold tabular-nums">{fmtMoney(q.total.toString(), q.currency)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <div className="p-5">
            <DescriptionList cols={1} items={[
              { label: "Customer", value: q.contact ? <Link className="link" href={`/portal/contacts/${q.contact.id}`}>{fullName(q.contact)}</Link> : q.customerName ?? "—" },
              { label: "Phone", value: q.contact?.phone ?? "—" },
              { label: "Quote date", value: fmtDate(q.quoteDate) },
              { label: "Valid until", value: q.validUntil ? fmtDate(q.validUntil) : "No expiry" },
              ...(order ? [{ label: "Customer order", value: <Link className="link" href={`/portal/sales-orders/${order.id}`}>SO-{order.number}</Link> }] : []),
              ...(q.status === "REJECTED" ? [{ label: "Rejected", value: q.rejectReason ?? "—" }] : []),
              { label: "Notes", value: q.notes ?? "—" },
            ]} />
          </div>
        </Card>
      </div>
    </>
  );
}
