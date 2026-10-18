import { Download, FileSpreadsheet, Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDay } from "@/server/ops-access";
import { Badge, EmptyState, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { AddVoucherDocsDialog, CreateVoucherDialog, RemoveVoucherDocButton, ReviewVoucherButtons } from "@/components/accounts/voucher-dialogs";
import { EXPENSE_CATEGORIES, VOUCHER_DOC_KIND, VOUCHER_KIND, VOUCHER_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { startOfMonth } from "date-fns";

/** Expense vouchers with their supporting documents. `dealershipId` null = every dealership (central review). */
export async function VouchersPanel({
  dealershipId, mode, rawParams, base, canCreate = false, canReview = false,
}: { dealershipId: string | null; mode: "dealer" | "central"; rawParams: Record<string, string | string[] | undefined>; base: string; canCreate?: boolean; canReview?: boolean }) {
  const { flat: p, page, pageSize, skip } = parseListParams(rawParams, { pageSize: 20 });
  const where: Prisma.ExpenseVoucherWhereInput = {
    ...(dealershipId ? { dealershipId } : p.dealership ? { dealershipId: p.dealership } : {}),
    ...(p.status ? { status: p.status as Prisma.EnumVoucherStatusFilter["equals"] } : {}),
    ...(p.kind ? { kind: p.kind as Prisma.EnumVoucherKindFilter["equals"] } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.from || p.to ? { voucherDate: { ...(parseDay(p.from ?? null) ? { gte: parseDay(p.from ?? null)! } : {}), ...(parseDay(p.to ?? null, true) ? { lte: parseDay(p.to ?? null, true)! } : {}) } } : {}),
    ...(p.q ? { OR: [{ payee: { contains: p.q, mode: "insensitive" } }, { reference: { contains: p.q, mode: "insensitive" } }, { description: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const monthStart = startOfMonth(new Date());
  const [rows, total, month, awaiting, dealerships] = await Promise.all([
    db.expenseVoucher.findMany({
      where, orderBy: [{ voucherDate: "desc" }, { number: "desc" }], skip, take: pageSize,
      include: { dealership: { select: { name: true } }, createdBy: { select: { name: true } }, attachments: { include: { file: { select: { originalName: true } } }, orderBy: { createdAt: "asc" } } },
    }),
    db.expenseVoucher.count({ where }),
    db.expenseVoucher.aggregate({ where: { ...(dealershipId ? { dealershipId } : {}), kind: "EXPENSE", voucherDate: { gte: monthStart } }, _sum: { amount: true, taxAmount: true }, _count: true }),
    db.expenseVoucher.count({ where: { ...(dealershipId ? { dealershipId } : {}), status: "SUBMITTED", kind: "EXPENSE" } }),
    mode === "central" && !dealershipId ? db.dealership.findMany({ where: { vouchers: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const exportQ = new URLSearchParams({ ...(dealershipId ? { dealership: dealershipId } : {}), ...(p.from ? { from: p.from } : {}), ...(p.to ? { to: p.to } : {}), ...(p.status ? { status: p.status } : {}) }).toString();

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Expenses this month" value={fmtMoney(month._sum.amount?.toString() ?? 0)} icon={Receipt} hint={`${month._count} voucher${month._count === 1 ? "" : "s"}`} />
        <StatCard label="Tax included this month" value={fmtMoney(month._sum.taxAmount?.toString() ?? 0)} icon={FileSpreadsheet} tone="blue" hint="For tax records" />
        <StatCard label="Awaiting review" value={awaiting} icon={Receipt} tone="amber" />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar className="mb-0" filters={[
            { type: "search", name: "q", label: "Search", placeholder: "Payee, reference or note" },
            { type: "select", name: "status", label: "Any status", options: Object.entries(VOUCHER_STATUS).map(([value, m]) => ({ value, label: m.label })) },
            { type: "select", name: "kind", label: "All types", options: Object.entries(VOUCHER_KIND).map(([value, label]) => ({ value, label })) },
            { type: "select", name: "category", label: "Any category", options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })) },
            ...(dealerships.length ? [{ type: "select" as const, name: "dealership", label: "Any dealership", options: dealerships.map((d) => ({ value: d.id, label: d.name })) }] : []),
            { type: "daterange", from: "from", to: "to", label: "Dated", presets: true },
          ]} />
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href={`/api/vouchers/export?${exportQ}`} variant="secondary" download><FileSpreadsheet className="h-4 w-4" /> Excel (tax records)</ButtonLink>
          {mode === "dealer" && canCreate && dealershipId && <CreateVoucherDialog dealershipId={dealershipId} />}
        </div>
      </div>

      <TableWrap footer={<Pagination base={base} params={p} page={page} pageSize={pageSize} total={total} sizes={[20, 50]} />}>
        <thead className="bg-ink-50/60">
          <tr><th className="th">Voucher</th>{mode === "central" && <th className="th">Dealership</th>}<th className="th">Date</th><th className="th">Category / payee</th><th className="th text-right">Amount</th><th className="th text-right">Tax</th><th className="th">Status</th><th className="th">Documents</th><th className="th"><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((v) => {
            const st = VOUCHER_STATUS[v.status]!;
            const editable = mode === "dealer" && canCreate && v.status === "SUBMITTED";
            return (
              <tr key={v.id} className="align-top hover:bg-ink-50/50">
                <td className="td whitespace-nowrap"><span className="font-mono text-[13px]">EV-{v.number}</span><span className="block text-xs text-ink-400">{VOUCHER_KIND[v.kind]}</span></td>
                {mode === "central" && <td className="td">{v.dealership.name}</td>}
                <td className="td whitespace-nowrap text-xs">{fmtDate(v.voucherDate)}</td>
                <td className="td max-w-xs"><p className="font-medium text-ink-900">{v.category}</p>{v.payee && <p className="text-xs text-ink-500">{v.payee}</p>}{v.reference && <p className="font-mono text-xs text-ink-400">{v.reference}</p>}{v.reviewNote && <p className="text-xs text-red-600">{v.reviewNote}</p>}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(v.amount.toString(), v.currency)}</td>
                <td className="td text-right tabular-nums text-ink-500">{Number(v.taxAmount) > 0 ? fmtMoney(v.taxAmount.toString(), v.currency) : "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td">
                  <ul className="space-y-1">
                    {v.attachments.length === 0 && <li className="text-xs text-amber-700">No documents attached</li>}
                    {v.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-1.5 text-xs">
                        <a href={`/api/files/${a.fileId}?download=1`} className="inline-flex max-w-52 items-center gap-1 truncate text-brand-700 hover:underline" title={a.file.originalName}>
                          <Download className="h-3 w-3 shrink-0" /> <span className="truncate">{VOUCHER_DOC_KIND[a.kind]}</span>
                        </a>
                        {editable && v.kind === "EXPENSE" && <RemoveVoucherDocButton attachmentId={a.id} />}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="td">
                  {mode === "dealer" && canCreate && v.kind === "EXPENSE" && <AddVoucherDocsDialog voucherId={v.id} number={v.number} />}
                  {mode === "central" && canReview && v.kind === "EXPENSE" && v.status === "SUBMITTED" && <ReviewVoucherButtons voucherId={v.id} number={v.number} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={Receipt} title="No vouchers" description={mode === "dealer" ? "Record an expense and attach its receipt or invoice — everything is kept for your tax records." : "Dealership expense vouchers and payment proofs appear here."} />
        </div>
      )}
    </>
  );
}
