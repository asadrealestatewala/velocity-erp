import Link from "next/link";
import { Download, FileSpreadsheet, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { balancesByDealership } from "@/server/services/ledger";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { RejectPaymentDialog, VerifyPaymentButton } from "@/components/accounts/ledger-controls";
import { PAYMENT_METHOD_LABEL, VOUCHER_DOC_KIND } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const metadata = { title: "Ledgers & payments" };

export default async function LedgerOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage("ledger.view");
  const params = await searchParams;
  const dealershipFilter = typeof params.dealership === "string" ? params.dealership : undefined;
  const manage = can(user, "ledger.manage");
  const [queue, dealers, balances] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { status: "PENDING_VERIFICATION", type: "PAYMENT", ...(dealershipFilter ? { dealershipId: dealershipFilter } : {}) },
      orderBy: { createdAt: "asc" },
      include: { dealership: { select: { id: true, name: true } }, recordedBy: { select: { name: true } }, voucher: { include: { attachments: { include: { file: { select: { originalName: true } } } } } }, order: { select: { number: true } } },
    }),
    db.dealership.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, city: { select: { name: true } } } }),
    balancesByDealership(),
  ]);
  const rows = dealers.map((d) => ({ ...d, b: balances.get(d.id) })).filter((d) => d.b || true).sort((a, b) => (b.b?.balance ?? 0) - (a.b?.balance ?? 0));
  const receivable = rows.reduce((s, r) => s + Math.max(0, r.b?.balance ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Ledgers & payments"
        description="Verify the payments dealerships report against their proof, and see what each dealer owes."
        breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Ledgers" }]}
        actions={<ButtonLink href="/api/ledger/export?scope=all&format=xlsx" variant="secondary" download><FileSpreadsheet className="h-4 w-4" /> All balances (Excel)</ButtonLink>}
      />

      <Card className="mb-6">
        <CardHeader title="Payments awaiting verification" description="A payment only reduces the dealer's balance once you verify it against the proof" />
        {queue.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing to verify" description="Payments dealerships report — with proof attached — will appear here." />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-ink-50/60"><tr><th className="th">Dealership</th><th className="th">Paid on</th><th className="th text-right">Amount</th><th className="th">Method / reference</th><th className="th">Applies to</th><th className="th">Proof</th>{manage && <th className="th"><span className="sr-only">Decision</span></th>}</tr></thead>
              <tbody className="divide-y divide-ink-100">
                {queue.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="td"><Link href={`/procurement/dealers/${e.dealership.id}?tab=ledger`} className="link">{e.dealership.name}</Link><span className="block text-xs text-ink-500">by {e.recordedBy.name}</span></td>
                    <td className="td whitespace-nowrap text-xs">{fmtDate(e.entryDate)}</td>
                    <td className="td text-right font-semibold tabular-nums">{fmtMoney(e.credit.toString(), e.currency)}</td>
                    <td className="td text-sm">{e.method ? PAYMENT_METHOD_LABEL[e.method] : "—"}{e.reference && <span className="block font-mono text-xs text-ink-500">{e.reference}</span>}{e.description && <span className="block text-xs text-ink-400">{e.description}</span>}</td>
                    <td className="td text-xs">{e.order ? `PO-${e.order.number}` : "Account"}</td>
                    <td className="td">
                      <ul className="space-y-1">
                        {(e.voucher?.attachments ?? []).map((a) => (
                          <li key={a.id}><a href={`/api/files/${a.fileId}?download=1`} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline" title={a.file.originalName}><Download className="h-3 w-3" /> {VOUCHER_DOC_KIND[a.kind]}</a></li>
                        ))}
                        {!e.voucher?.attachments.length && <li><Badge tone="amber">No proof</Badge></li>}
                      </ul>
                    </td>
                    {manage && <td className="td"><div className="flex gap-1.5"><VerifyPaymentButton entryId={e.id} /><RejectPaymentDialog entryId={e.id} /></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Dealer balances" description={`${fmtMoney(receivable)} outstanding across all dealerships`} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-ink-50/60"><tr><th className="th">Dealership</th><th className="th">City</th><th className="th text-right">Invoiced</th><th className="th text-right">Paid &amp; verified</th><th className="th text-right">Balance owed</th><th className="th text-right">Awaiting verification</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-ink-50/50">
                  <td className="td"><Link href={`/procurement/dealers/${d.id}?tab=ledger`} className="link">{d.name}</Link></td>
                  <td className="td">{d.city.name}</td>
                  <td className="td text-right tabular-nums">{d.b ? fmtMoney(d.b.debit) : "—"}</td>
                  <td className="td text-right tabular-nums">{d.b ? fmtMoney(d.b.credit) : "—"}</td>
                  <td className="td text-right font-semibold tabular-nums">{d.b ? <span className={d.b.balance > 0 ? "text-red-700" : "text-emerald-700"}>{fmtMoney(d.b.balance)}</span> : "—"}</td>
                  <td className="td text-right tabular-nums">{d.b && d.b.pending > 0 ? <span className="text-amber-700">{fmtMoney(d.b.pending)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
