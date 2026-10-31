import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterTabs, SearchBox } from "@/components/platform/list";
import { SavedViews } from "@/components/platform/saved-views";
import { TableWrap } from "@/components/ui/table";
import { ActionForm, ReasonButton, RunButton } from "@/components/platform/console";
import { confirmPaymentAction, refundAction, rejectPaymentAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { creditNoteNumber, invoiceNumber, METHOD_LABEL } from "@/server/platform/billing";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Payments & invoices" };

const VIEWS = [{ key: "all", label: "All invoices" }, { key: "refunded", label: "Refunded" }, { key: "clean", label: "Not refunded" }];

export default async function Payments({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const admin = await requireAdminPage("payments.manage");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "all";
  const q = sp.q?.trim() || undefined;
  const num = q && /^(inv-?)?\d+$/i.test(q) ? Number(q.replace(/\D/g, "")) : null;
  const search = q ? { OR: [{ tenant: { is: { name: { contains: q, mode: "insensitive" as const } } } }, { reference: { contains: q, mode: "insensitive" as const } }, ...(num !== null ? [{ number: num }] : [])] } : {};
  const whereFor = (v: string) => (v === "refunded" ? { refunds: { some: {} } } : v === "clean" ? { refunds: { none: {} } } : {});
  const db = platformDb();
  const [counts, pending, invoices, recent] = await Promise.all([
    Promise.all(VIEWS.map((v) => db.invoice.count({ where: { ...whereFor(v.key), ...search } }))),
    db.payment.findMany({ where: { status: "PENDING" }, orderBy: { submittedAt: "asc" }, include: { tenant: { select: { name: true, slug: true } } } }),
    db.invoice.findMany({ where: { ...whereFor(view), ...search }, orderBy: { issuedAt: "desc" }, take: 60, include: { tenant: { select: { name: true, slug: true } }, refunds: true } }),
    db.payment.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15, include: { tenant: { select: { name: true } } } }),
  ]);
  const canRefund = adminCan(admin.role, "refunds.manage");
  return (
    <>
      <PageHeader title="Payments & invoices" description="Confirm that the money arrived before activating a plan." />
      <Card>
        <CardHeader title={`Waiting for confirmation (${pending.length})`} description="Check the reference against your bank or wallet statement first." />
        <ul className="divide-y divide-ink-100">
          {pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{p.tenant.name} <span className="text-ink-500">({p.tenant.slug})</span></p>
                <p className="text-ink-600">{fmtMoney(p.amount, p.currency)} · {METHOD_LABEL[p.method]} · ref <code className="font-mono">{p.reference}</code> · {p.planKey} / {p.interval === "YEAR" ? "yearly" : "monthly"}</p>
                <p className="text-xs text-ink-500">Submitted {fmtDateTime(p.submittedAt)}{p.couponCode ? ` · coupon ${p.couponCode}` : ""}{p.note ? ` · "${p.note}"` : ""}</p>
              </div>
              <div className="flex gap-2">
                <RunButton label="Confirm received" variant="primary" action={confirmPaymentAction.bind(null, p.id)} />
                <ReasonButton label="Reject" variant="danger" title="Reject this payment?" description="The customer is emailed your reason." action={rejectPaymentAction.bind(null, p.id)} />
              </div>
            </li>
          ))}
          {!pending.length && <li className="px-5 py-6 text-sm text-ink-500">All clear. No payments are waiting for confirmation.</li>}
        </ul>
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold">Invoices</h2>
      <FilterTabs label="Invoice views" active={view} tabs={VIEWS.map((v, i) => ({ key: v.key, label: v.label, count: counts[i], href: `/platform/payments?${new URLSearchParams({ view: v.key, ...(q ? { q } : {}) })}` }))} />
      <SearchBox id="inv-q" label="Search invoices" action="/platform/payments" q={q} placeholder="Company, invoice number or reference" keep={{ view }} clearHref={`/platform/payments?view=${view}`} />
      <SavedViews storageKey="payments" />
      <TableWrap>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Company</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Amount</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">Refunded</th><th className="px-4 py-2.5" /></tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {invoices.map((i) => {
            const refunded = i.refunds.reduce((n, r) => n + r.amount, 0);
            return (
              <tr key={i.id}>
                <td className="px-4 py-2.5"><a className="link text-brand-600" href={`/api/platform/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">{invoiceNumber(i.number)}</a><div className="text-xs text-ink-500">{fmtDateTime(i.issuedAt)}</div></td>
                <td className="px-4 py-2.5">{i.tenant.name}</td>
                <td className="px-4 py-2.5 capitalize">{i.planKey} · {i.interval === "YEAR" ? "yearly" : "monthly"}</td>
                <td className="px-4 py-2.5">{fmtMoney(i.amount, i.currency)}</td>
                <td className="px-4 py-2.5">{METHOD_LABEL[i.method]}{i.reference ? ` · ${i.reference}` : ""}</td>
                <td className="px-4 py-2.5">{refunded ? <><Badge tone="amber">{fmtMoney(refunded, i.currency)}</Badge> {i.refunds.map((r) => <a key={r.id} className="link ml-1 text-xs text-brand-600" href={`/api/platform/refunds/${r.id}/pdf`} target="_blank" rel="noreferrer">{creditNoteNumber(r.number)}</a>)}</> : "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {canRefund && refunded < i.amount && (
                    <ReasonButton
                      label="Refund"
                      title={`Refund ${invoiceNumber(i.number)}`}
                      description="Record money you have already sent back. This does not move money by itself; for card payments refund in Stripe too."
                      action={refundAction.bind(null, i.id)}
                      hideDefaultReason
                      extra={[
                        { name: "amount", label: `Amount (${i.currency}, up to ${i.amount - refunded})`, type: "number", defaultValue: i.amount - refunded },
                        { name: "reason", label: "Reason", type: "textarea" },
                        { name: "method", label: "Sent via", optional: true },
                        { name: "reference", label: "Reference", optional: true },
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
          {!invoices.length && <tr><td colSpan={7}><EmptyState icon={FileText} title={q || view !== "all" ? "No invoices match these filters" : "No invoices yet"} description={q || view !== "all" ? "Try a different search or view." : "An invoice is created each time a payment is confirmed."} action={q || view !== "all" ? <Link href="/platform/payments" className="link text-sm">Clear filters</Link> : undefined} /></td></tr>}
        </tbody>
      </TableWrap>

      <Card className="mt-6">
        <CardHeader title="Recently decided payments" />
        <ul className="divide-y divide-ink-100 text-sm">
          {recent.map((p) => (
            <li key={p.id} className="flex justify-between px-5 py-2.5">
              <span>{p.tenant.name} · {fmtMoney(p.amount, p.currency)} · {METHOD_LABEL[p.method]} · {p.reference}</span>
              <span><Badge tone={p.status === "CONFIRMED" ? "green" : "red"}>{p.status.toLowerCase()}</Badge> <span className="text-xs text-ink-500">{p.decidedBy} · {fmtDateTime(p.decidedAt)}</span></span>
            </li>
          ))}
          {!recent.length && <li className="px-5 py-4 text-ink-500">None yet.</li>}
        </ul>
      </Card>
    </>
  );
}
