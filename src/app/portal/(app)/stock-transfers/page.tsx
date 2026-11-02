import Link from "next/link";
import { PackageCheck, Truck } from "lucide-react";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { listShowroomStock } from "@/server/services/inventory";
import { listTransfers, relatedOutlets } from "@/server/services/stock-transfers";
import { db } from "@/lib/db";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { NewTransferDialog } from "@/components/stock/transfer-controls";
import { TRANSFER_STATUS } from "@/lib/ops-constants";
import { fmtDate, sp } from "@/lib/utils";

export const metadata = { title: "Stock transfers" };

export default async function StockTransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const manage = can(user, "inventory.manage");
  const [transfers, outlets, stock] = await Promise.all([
    listTransfers(dealershipId),
    manage ? relatedOutlets(db, dealershipId) : Promise.resolve([]),
    manage ? listShowroomStock(dealershipId) : Promise.resolve([]),
  ]);
  const incoming = transfers.filter((t) => t.status === "IN_TRANSIT" && t.toDealershipId === dealershipId).length;
  const outgoing = transfers.filter((t) => t.status === "IN_TRANSIT" && t.fromDealershipId === dealershipId).length;
  const q = params.dealership ? `?dealership=${dealershipId}` : "";

  return (
    <>
      <PageHeader
        title="Stock transfers"
        description="Move bikes and spare parts between the outlets of your group. Stock leaves the sender when it is sent and joins the receiver when they confirm it arrived."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock transfers" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {manage && <NewTransferDialog dealershipId={dealershipId} outlets={outlets} items={stock.filter((s) => s.quantity > 0).map((s) => ({ id: s.id, name: s.name, code: s.code, quantity: s.quantity }))} />}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Arriving at this outlet" value={incoming} icon={PackageCheck} tone="violet" hint="Waiting for you to confirm receipt" />
        <StatCard label="On their way from this outlet" value={outgoing} icon={Truck} tone="blue" />
      </div>
      <TableWrap>
        <thead className="bg-ink-50/60"><tr><th className="th">Transfer</th><th className="th">From</th><th className="th">To</th><th className="th text-right">Units</th><th className="th">Status</th><th className="th">Sent</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {transfers.map((t) => (
            <tr key={t.id} className="hover:bg-ink-50/50">
              <td className="td"><Link href={`/portal/stock-transfers/${t.id}${q}`} className="link font-mono text-[13px]">TR-{t.number}</Link></td>
              <td className="td">{t.from.name}</td>
              <td className="td">{t.to.name}</td>
              <td className="td text-right tabular-nums">{t.lines.reduce((n, l) => n + l.quantity, 0)}</td>
              <td className="td"><Badge tone={TRANSFER_STATUS[t.status]!.tone}>{TRANSFER_STATUS[t.status]!.label}</Badge></td>
              <td className="td text-xs whitespace-nowrap text-ink-500">{fmtDate(t.sentAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {transfers.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={Truck} title="No transfers yet" description={manage ? "Use “New transfer” to send stock to another outlet of your group." : "Transfers sent or received by your outlet will appear here."} />
        </div>
      )}
    </>
  );
}
