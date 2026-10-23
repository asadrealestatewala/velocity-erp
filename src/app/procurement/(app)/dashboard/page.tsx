import Link from "next/link";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, FileClock, PackageCheck, Receipt, Truck, Wallet } from "lucide-react";
import { startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { procurementStats } from "@/server/services/procurement";
import { balancesByDealership } from "@/server/services/ledger";
import { Card, CardHeader, EmptyState, StatCard } from "@/components/ui/misc";
import { DashboardHero, greeting } from "@/components/dashboard/widgets";
import { DispatchBadge, ExpectedDelivery, StatusBadge } from "@/components/procurement/order-parts";
import { fmtDate, fmtMoney, fmtRelative } from "@/lib/utils";

export const metadata = { title: "Procurement dashboard" };

export default async function ProcurementDashboard() {
  const user = await requireProcurementPage("procurement.view");
  const seeLedger = can(user, "ledger.view");
  const seeVouchers = can(user, "vouchers.view_all");
  const monthStart = startOfMonth(new Date());
  const today = new Date(new Date().toDateString());

  const [stats, thisMonth, queue, recent, upcoming, pendingPayments, pendingVouchers, balances] = await Promise.all([
    procurementStats(),
    db.procurementOrder.count({ where: { submittedAt: { gte: monthStart } } }),
    db.procurementOrder.findMany({ where: { status: "SUBMITTED" }, orderBy: [{ priority: "desc" }, { submittedAt: "asc" }], take: 6, include: { dealership: { select: { name: true } }, lines: { select: { quantity: true } } } }),
    db.procurementOrder.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { dealership: { select: { name: true } } } }),
    db.procurementOrder.findMany({ where: { status: "APPROVED", expectedDeliveryDate: { not: null } }, orderBy: { expectedDeliveryDate: "asc" }, take: 6, include: { dealership: { select: { name: true } } } }),
    seeLedger ? db.ledgerEntry.count({ where: { status: "PENDING_VERIFICATION" } }) : Promise.resolve(0),
    seeVouchers ? db.expenseVoucher.count({ where: { status: "SUBMITTED", kind: "EXPENSE" } }) : Promise.resolve(0),
    seeLedger ? balancesByDealership() : Promise.resolve(new Map()),
  ]);
  const receivable = [...balances.values()].reduce((s, b) => s + Math.max(0, b.balance), 0);

  return (
    <>
      <DashboardHero
        greeting={greeting()}
        name={user.name.split(" ")[0]!}
        subtitle="Dealership stock orders, deliveries and accounts at a glance."
        stats={[
          { label: "Orders received", value: String(stats.total) },
          { label: "Awaiting action", value: String(stats.received) },
          { label: "Overdue deliveries", value: String(stats.overdue) },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders received" value={stats.total} icon={ClipboardList} hint={`${thisMonth} this month`} href="/procurement/orders" />
        <StatCard label="New — awaiting action" value={stats.received} icon={FileClock} tone="blue" hint="Approve or reject" href="/procurement/orders?status=SUBMITTED" />
        <StatCard label="Approved — in progress" value={stats.approved} icon={Truck} tone="violet" hint={`${stats.dispatched + stats.inTransit} dispatched or in transit`} href="/procurement/dispatch" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} tone="green" hint={stats.awaitingReceipt ? `${stats.awaitingReceipt} awaiting dealer receipt` : "All receipts confirmed"} href="/procurement/orders?status=DELIVERED" />
        <StatCard label="Overdue deliveries" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue ? "red" : "gray"} hint="Past the expected date" href="/procurement/dispatch" />
        <StatCard label="Not yet dispatched" value={stats.notDispatched + stats.packing} icon={PackageCheck} tone="amber" hint={`${stats.packing} being packed`} href="/procurement/dispatch" />
        {seeLedger && <StatCard label="Payments to verify" value={pendingPayments} icon={Banknote} tone={pendingPayments ? "amber" : "gray"} hint="Dealer payments with proof" href="/procurement/ledger" />}
        {seeLedger && <StatCard label="Outstanding from dealers" value={fmtMoney(receivable)} icon={Wallet} tone="brand" hint="Posted invoices less verified payments" href="/procurement/ledger" />}
        {seeVouchers && <StatCard label="Vouchers to review" value={pendingVouchers} icon={Receipt} tone="gray" hint="Expense vouchers submitted" href="/procurement/vouchers" />}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Needs a decision" description="Oldest and urgent orders first" action={<Link href="/procurement/orders?status=SUBMITTED" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>} />
          {queue.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing waiting" description="New dealership orders will appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {queue.map((o) => (
                <li key={o.id}>
                  <Link href={`/procurement/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50/60">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">PO-{o.number} · {o.dealership.name}{o.priority === "URGENT" && <span className="ml-2 text-xs font-semibold text-red-600">Urgent</span>}</span>
                      <span className="block text-xs text-ink-500">{o.lines.reduce((n, l) => n + l.quantity, 0)} units · {fmtRelative(o.submittedAt)}</span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming deliveries" description="By expected delivery date" action={<Link href="/procurement/dispatch" className="text-sm font-medium text-brand-600 hover:underline">Dispatch board</Link>} />
          {upcoming.length === 0 ? (
            <EmptyState icon={Truck} title="No scheduled deliveries" description="Approved orders with an expected date appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {upcoming.map((o) => (
                <li key={o.id}>
                  <Link href={`/procurement/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50/60">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">PO-{o.number} · {o.dealership.name}</span>
                      <span className="block text-xs text-ink-500">Expected <ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></span>
                    </span>
                    <DispatchBadge status={o.dispatchStatus} orderStatus={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent order activity" />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Dealership</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th">Dispatch</th><th className="th">Expected</th><th className="th">Updated</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {recent.map((o) => (
                <tr key={o.id} className="hover:bg-ink-50/50">
                  <td className="td"><Link href={`/procurement/orders/${o.id}`} className="link font-mono text-[13px]">PO-{o.number}</Link></td>
                  <td className="td">{o.dealership.name}</td>
                  <td className="td text-right tabular-nums">{Number(o.subtotal) > 0 ? fmtMoney(o.subtotal.toString(), o.currency) : <span className="text-ink-400">TBC</span>}</td>
                  <td className="td"><StatusBadge status={o.status} /></td>
                  <td className="td"><DispatchBadge status={o.dispatchStatus} orderStatus={o.status} /></td>
                  <td className="td text-xs whitespace-nowrap"><ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></td>
                  <td className="td text-xs whitespace-nowrap text-ink-500">{fmtDate(o.updatedAt)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7}><EmptyState icon={ClipboardList} title="No orders yet" description="Dealership stock orders will appear here once they are placed." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
