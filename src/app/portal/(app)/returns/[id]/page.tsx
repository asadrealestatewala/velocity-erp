import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { findReturn } from "@/server/services/returns";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ReturnActions } from "@/components/sales/return-actions";
import { REFUND_METHOD_LABEL, RETURN_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Return" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const r = await findReturn({ id, dealershipId: { in: dealershipIds(user) } });
  if (!r) notFound();
  const st = RETURN_STATUS[r.status]!;
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Return RET-{r.number} <Badge tone={st.tone}>{st.label}</Badge></span>}
        description={`Raised ${fmtDateTime(r.createdAt)} by ${r.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Returns & refunds", href: "/portal/returns" }, { label: `RET-${r.number}` }]}
        actions={<ButtonLink href={`/api/returns/${r.id}/pdf`} variant="secondary" download><Download className="h-4 w-4" /> PDF</ButtonLink>}
      />
      {r.status === "PENDING" && can(user, "returns.approve") && (
        <Card className="mb-6"><div className="p-5"><ReturnActions id={r.id} restock={r.restock} refund={fmtMoney(r.refundAmount.toString(), r.currency)} /></div></Card>
      )}
      {r.status === "PENDING" && !can(user, "returns.approve") && (
        <div className="card mb-6 p-4 text-sm text-ink-600">Waiting for a manager to approve this return.</div>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Returned items" />
          <table className="w-full">
            <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Refund</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {r.lines.map((l) => (
                <tr key={l.id}><td className="td font-medium text-ink-900">{l.invoiceLine.name}</td><td className="td text-right tabular-nums">{l.quantity}</td><td className="td text-right tabular-nums">{fmtMoney(l.amount.toString(), r.currency)}</td></tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink-200 text-sm"><tr><td colSpan={2} className="td text-right font-semibold text-ink-900">Total refund</td><td className="td text-right text-base font-bold tabular-nums">{fmtMoney(r.refundAmount.toString(), r.currency)}</td></tr></tfoot>
          </table>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <div className="p-5"><DescriptionList cols={1} items={[
            { label: "Invoice", value: <Link className="link" href={`/portal/invoices/${r.invoice.id}`}>INV-{r.invoice.number}</Link> },
            { label: "Customer", value: r.invoice.buyerName },
            { label: "Reason", value: r.reason },
            { label: "Restock", value: r.restock ? "Back into stock when approved" : "No — not resaleable" },
            ...(r.processedAt ? [{ label: r.status === "REJECTED" ? "Rejected" : "Approved", value: `${fmtDate(r.processedAt)} by ${r.processedBy?.name ?? "—"}` }] : []),
            ...(r.refundMethod ? [{ label: "Refund method", value: REFUND_METHOD_LABEL[r.refundMethod] }] : []),
            ...(r.rejectReason ? [{ label: "Rejection reason", value: r.rejectReason }] : []),
          ]} /></div>
        </Card>
      </div>
    </>
  );
}
