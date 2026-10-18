import { FileSpreadsheet, FileText, Paperclip, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { parseDay } from "@/server/ops-access";
import { ledgerStatement, dealerBalance } from "@/server/services/ledger";
import { Badge, Card, CardHeader, EmptyState, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { PostEntryDialog, RejectPaymentDialog, VerifyPaymentButton } from "@/components/accounts/ledger-controls";
import { RecordPaymentDialog } from "@/components/accounts/payment-dialog";
import { LEDGER_STATUS, LEDGER_TYPE, PAYMENT_METHOD_LABEL } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";

/** The dealer account: balance, statement with running balance, exports. Used by the dealer portal and the central dealer hub. */
export async function LedgerPanel({
  dealershipId, mode, params, canPay = false, canManage = false,
}: { dealershipId: string; mode: "dealer" | "central"; params: Record<string, string | undefined>; canPay?: boolean; canManage?: boolean }) {
  const from = parseDay(params.from ?? null);
  const to = parseDay(params.to ?? null, true);
  const [bal, stmt, orders] = await Promise.all([
    dealerBalance(dealershipId),
    ledgerStatement(dealershipId, { from, to }),
    canPay ? db.procurementOrder.findMany({ where: { dealershipId, status: { in: ["APPROVED", "DELIVERED"] } }, orderBy: { number: "desc" }, take: 30, select: { id: true, number: true } }) : Promise.resolve([]),
  ]);
  const q = new URLSearchParams({ dealership: dealershipId, ...(params.from ? { from: params.from } : {}), ...(params.to ? { to: params.to } : {}) }).toString();
  const keep = ["tab", "dealership"];

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={bal.balance < 0 ? "Credit with YADEA" : "Balance owed to YADEA"} value={fmtMoney(Math.abs(bal.balance))} icon={Wallet} tone={bal.balance > 0 ? "red" : "green"} hint="Posted invoices less verified payments" />
        <StatCard label="Total invoiced" value={fmtMoney(bal.debit)} icon={FileText} tone="blue" />
        <StatCard label="Total paid" value={fmtMoney(bal.credit)} icon={Wallet} tone="green" />
        <StatCard label="Awaiting verification" value={fmtMoney(bal.pending)} icon={Paperclip} tone="amber" hint={bal.pendingCount ? `${bal.pendingCount} payment${bal.pendingCount === 1 ? "" : "s"} with YADEA accounts` : "Nothing pending"} />
      </div>

      <FilterBar filters={[{ type: "daterange", from: "from", to: "to", label: "Period", presets: true }]} keep={keep} />

      <Card>
        <CardHeader
          title="Statement"
          description={
            stmt.rows.length
              ? `Opening balance ${fmtMoney(stmt.openingBalance)} · closing balance ${fmtMoney(stmt.closingBalance)}`
              : undefined
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/api/ledger/export?format=xlsx&${q}`} variant="secondary" size="sm" download><FileSpreadsheet className="h-4 w-4" /> Excel</ButtonLink>
              <ButtonLink href={`/api/ledger/export?format=pdf&${q}`} variant="secondary" size="sm" download><FileText className="h-4 w-4" /> PDF</ButtonLink>
              {mode === "dealer" && canPay && <RecordPaymentDialog dealershipId={dealershipId} orders={orders.map((o) => ({ id: o.id, label: `PO-${o.number}` }))} suggestedAmount={bal.balance > 0 ? bal.balance : undefined} />}
              {mode === "central" && canManage && <PostEntryDialog dealershipId={dealershipId} />}
            </div>
          }
        />
        {stmt.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No ledger entries" description={mode === "dealer" ? "Invoices for your stock orders and your payments will be listed here." : "Entries appear when an order is dispatched or a payment is recorded."} />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-ink-50/60">
                <tr><th className="th">Date</th><th className="th">Entry</th><th className="th">Type</th><th className="th">Reference</th><th className="th">Description</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th><th className="th text-right">Balance</th><th className="th">Status</th>{mode === "central" && canManage && <th className="th"><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {stmt.rows.map((r) => {
                  const inactive = r.status !== "POSTED";
                  const st = LEDGER_STATUS[r.status]!;
                  return (
                    <tr key={r.id} className={inactive ? "bg-ink-50/40 text-ink-500" : "hover:bg-ink-50/50"}>
                      <td className="td whitespace-nowrap text-xs">{fmtDate(r.date)}</td>
                      <td className="td font-mono text-xs">#{r.number}</td>
                      <td className="td"><Badge tone={LEDGER_TYPE[r.type]?.tone}>{LEDGER_TYPE[r.type]?.label}</Badge></td>
                      <td className="td font-mono text-xs">{r.reference ?? "—"}</td>
                      <td className="td max-w-xs">
                        {r.description}
                        {r.method && <span className="block text-xs text-ink-400">{PAYMENT_METHOD_LABEL[r.method]}</span>}
                        {r.rejectionReason && <span className="block text-xs text-red-600">{r.rejectionReason}</span>}
                      </td>
                      <td className="td text-right tabular-nums">{r.debit ? fmtMoney(r.debit) : "—"}</td>
                      <td className="td text-right tabular-nums">{r.credit ? fmtMoney(r.credit) : "—"}</td>
                      <td className="td text-right font-medium tabular-nums">{inactive ? <span className="text-ink-300">—</span> : fmtMoney(r.balance)}</td>
                      <td className="td"><Badge tone={st.tone}>{st.label}</Badge>{r.hasProof && <span title="Proof attached"><Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-ink-400" /></span>}</td>
                      {mode === "central" && canManage && (
                        <td className="td">
                          {r.status === "PENDING_VERIFICATION" && <div className="flex gap-1.5"><VerifyPaymentButton entryId={r.id} /><RejectPaymentDialog entryId={r.id} /></div>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-ink-200 bg-ink-50/40">
                <tr>
                  <td colSpan={5} className="td text-right font-semibold text-ink-900">Totals for the period (posted entries)</td>
                  <td className="td text-right font-semibold tabular-nums">{fmtMoney(stmt.totalDebit)}</td>
                  <td className="td text-right font-semibold tabular-nums">{fmtMoney(stmt.totalCredit)}</td>
                  <td className="td text-right font-bold tabular-nums">{fmtMoney(stmt.closingBalance)}</td>
                  <td colSpan={mode === "central" && canManage ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-500">
        Payments you record stay “awaiting verification” and do not change the balance until YADEA accounts verifies the proof. Pending and rejected entries are shown for transparency but are excluded from the balance.
      </p>
    </>
  );
}
