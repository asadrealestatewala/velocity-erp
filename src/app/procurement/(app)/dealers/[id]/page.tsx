import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { dealerBalance } from "@/server/services/ledger";
import { procurementStats } from "@/server/services/procurement";
import { listShowroomStock } from "@/server/services/inventory";
import { Badge, Card, CardHeader, DescriptionList, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { LedgerPanel } from "@/components/accounts/ledger-panel";
import { VouchersPanel } from "@/components/accounts/vouchers-panel";
import { DocumentsPanel } from "@/components/accounts/documents-panel";
import { DispatchBadge, ExpectedDelivery, StatusBadge } from "@/components/procurement/order-parts";
import { DEALERSHIP_STATUS } from "@/lib/constants";
import { STOCK_STATE, stockState } from "@/lib/ops-constants";
import { cn, fmtDate, fmtMoney, sp } from "@/lib/utils";
import { Boxes, ClipboardList, FileText, Wallet } from "lucide-react";

export const metadata = { title: "Dealership" };

const TABS = [
  { key: "overview", label: "Overview", perm: null },
  { key: "stock", label: "Stock", perm: "inventory.view_all" },
  { key: "orders", label: "Orders", perm: "procurement.view" },
  { key: "ledger", label: "Ledger", perm: "ledger.view" },
  { key: "vouchers", label: "Vouchers", perm: "vouchers.view_all" },
  { key: "documents", label: "Documents", perm: "dealerships.view" },
] as const;

export default async function DealerHubPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage("dealerships.view");
  const { id } = await params;
  const raw = await searchParams;
  const dealer = await db.dealership.findUnique({
    where: { id },
    include: { city: { select: { name: true } }, memberships: { where: { isActive: true }, include: { user: { select: { name: true, email: true, phone: true } } }, orderBy: { role: "asc" } } },
  });
  if (!dealer) notFound();
  const tabs = TABS.filter((t) => !t.perm || can(user, t.perm));
  const tab = tabs.find((t) => t.key === sp(raw.tab))?.key ?? "overview";
  const flat: Record<string, string | undefined> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const st = DEALERSHIP_STATUS[dealer.status]!;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{dealer.name} <Badge tone={st.tone}>{st.label}</Badge></span>}
        description={`${dealer.code} · ${dealer.city.name}`}
        breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Dealerships", href: "/procurement/dealers" }, { label: dealer.name }]}
        actions={can(user, "dealerships.view") && can(user, "dashboard.view") ? <Link href={`/crm/dealerships/${dealer.id}`} className="text-sm font-medium text-brand-600 hover:underline">Open in CRM →</Link> : undefined}
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-200" role="tablist" aria-label="Dealership sections">
        {tabs.map((t) => (
          <Link key={t.key} href={`/procurement/dealers/${id}?tab=${t.key}`} role="tab" aria-selected={tab === t.key} className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition", tab === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && <Overview dealerId={id} user={user} dealer={dealer} />}
      {tab === "stock" && <StockTab dealershipId={id} />}
      {tab === "orders" && <OrdersTab dealershipId={id} />}
      {tab === "ledger" && <LedgerPanel dealershipId={id} mode="central" params={flat} canManage={can(user, "ledger.manage")} />}
      {tab === "vouchers" && <VouchersPanel dealershipId={id} mode="central" rawParams={raw} base={`/procurement/dealers/${id}`} canReview={can(user, "vouchers.view_all")} />}
      {tab === "documents" && <DocumentsPanel dealershipId={id} dealershipName={dealer.name} mode="central" canUpload={can(user, "dealerdocs.admin")} />}
    </>
  );
}

async function Overview({ dealerId, user, dealer }: { dealerId: string; user: Awaited<ReturnType<typeof requireProcurementPage>>; dealer: { name: string; phone: string | null; email: string | null; contactName: string | null; address: string | null; city: { name: string }; memberships: { id: string; role: string; user: { name: string; email: string; phone: string | null } }[] } }) {
  const seeLedger = can(user, "ledger.view");
  const [stats, bal, stock, docs] = await Promise.all([
    procurementStats(dealerId),
    seeLedger ? dealerBalance(dealerId) : Promise.resolve(null),
    db.inventoryItem.aggregate({ where: { dealershipId: dealerId }, _sum: { quantity: true }, _count: true }),
    db.dealershipDocument.count({ where: { dealershipId: dealerId, deletedAt: null } }),
  ]);
  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open orders" value={stats.received + stats.approved} icon={ClipboardList} hint={`${stats.delivered} delivered · ${stats.total} total`} />
        <StatCard label="Units in showroom" value={stock._sum.quantity ?? 0} icon={Boxes} tone="blue" hint={`${stock._count} stock lines`} />
        {bal && <StatCard label="Balance owed" value={fmtMoney(bal.balance)} icon={Wallet} tone={bal.balance > 0 ? "red" : "green"} hint={bal.pendingCount ? `${fmtMoney(bal.pending)} awaiting verification` : undefined} />}
        <StatCard label="Documents on file" value={docs} icon={FileText} tone="gray" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Showroom" />
          <div className="p-5"><DescriptionList items={[{ label: "Contact", value: dealer.contactName ?? "—" }, { label: "Phone", value: dealer.phone ?? "—" }, { label: "Email", value: dealer.email ?? "—" }, { label: "City", value: dealer.city.name }, { label: "Address", value: dealer.address ?? "—" }]} /></div>
        </Card>
        <Card>
          <CardHeader title="Portal users" description="People who can sign in for this dealership" />
          <ul className="divide-y divide-ink-100 text-sm">
            {dealer.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span><span className="font-medium text-ink-900">{m.user.name}</span><span className="block text-xs text-ink-500">{m.user.email}{m.user.phone ? ` · ${m.user.phone}` : ""}</span></span>
                <Badge tone={m.role === "MANAGER" ? "brand" : "gray"}>{m.role === "MANAGER" ? "Manager" : "Sales rep"}</Badge>
              </li>
            ))}
            {dealer.memberships.length === 0 && <li className="px-5 py-4 text-ink-500">No active users.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

async function StockTab({ dealershipId }: { dealershipId: string }) {
  const stock = await listShowroomStock(dealershipId);
  if (stock.length === 0) return <div className="card"><EmptyState icon={Boxes} title="No stock recorded" description="This dealership hasn't added its showroom inventory yet." /></div>;
  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Type</th><th className="th text-right">In stock</th><th className="th text-right">Reorder level</th><th className="th">Status</th><th className="th">Updated</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {stock.map((s) => {
              const m = STOCK_STATE[stockState(s.quantity, s.reorderLevel)];
              return (
                <tr key={s.id}>
                  <td className="td"><span className="font-medium text-ink-900">{s.name}</span><span className="ml-2 font-mono text-xs text-ink-400">{s.code}</span></td>
                  <td className="td">{s.kind === "BIKE" ? "Bike" : "Spare part"}</td>
                  <td className="td text-right font-semibold tabular-nums">{s.quantity}</td>
                  <td className="td text-right tabular-nums text-ink-500">{s.reorderLevel || "—"}</td>
                  <td className="td"><Badge tone={m.tone}>{m.label}</Badge></td>
                  <td className="td text-xs whitespace-nowrap text-ink-500">{fmtDate(s.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function OrdersTab({ dealershipId }: { dealershipId: string }) {
  const orders = await db.procurementOrder.findMany({ where: { dealershipId }, orderBy: { submittedAt: "desc" }, take: 50, include: { lines: { select: { quantity: true } } } });
  if (orders.length === 0) return <div className="card"><EmptyState icon={ClipboardList} title="No orders yet" /></div>;
  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-ink-50/60"><tr><th className="th">Order</th><th className="th">Placed</th><th className="th text-right">Units</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th">Dispatch</th><th className="th">Expected</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/procurement/orders/${o.id}`} className="link font-mono text-[13px]">PO-{o.number}</Link></td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(o.submittedAt)}</td>
                <td className="td text-right tabular-nums">{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
                <td className="td text-right tabular-nums">{Number(o.subtotal) > 0 ? fmtMoney(o.subtotal.toString(), o.currency) : "TBC"}</td>
                <td className="td"><StatusBadge status={o.status} /></td>
                <td className="td"><DispatchBadge status={o.dispatchStatus} orderStatus={o.status} /></td>
                <td className="td whitespace-nowrap text-xs"><ExpectedDelivery date={o.expectedDeliveryDate} status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
