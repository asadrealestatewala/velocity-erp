import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { listCounts } from "@/server/services/stock-counts";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { StartCountDialog } from "@/components/stock/count-controls";
import { STOCK_COUNT_STATUS } from "@/lib/ops-constants";
import { fmtDate, sp } from "@/lib/utils";

export const metadata = { title: "Stock counts" };

export default async function StockCountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const manage = can(user, "inventory.manage");
  const counts = await listCounts(dealershipId);
  const q = params.dealership ? `?dealership=${dealershipId}` : "";
  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Check the shelves against the system. Closing a count corrects every difference and records it in each item's history."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock counts" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {manage && <StartCountDialog dealershipId={dealershipId} />}
          </>
        }
      />
      <TableWrap>
        <thead className="bg-ink-50/60"><tr><th className="th">Count</th><th className="th">Title</th><th className="th text-right">Items</th><th className="th">Status</th><th className="th">Started by</th><th className="th">Date</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {counts.map((c) => (
            <tr key={c.id} className="hover:bg-ink-50/50">
              <td className="td"><Link href={`/portal/stock-counts/${c.id}${q}`} className="link font-mono text-[13px]">SC-{c.number}</Link></td>
              <td className="td">{c.title ?? "—"}</td>
              <td className="td text-right tabular-nums">{c._count.lines}</td>
              <td className="td"><Badge tone={STOCK_COUNT_STATUS[c.status]!.tone}>{STOCK_COUNT_STATUS[c.status]!.label}</Badge></td>
              <td className="td">{c.startedBy.name}</td>
              <td className="td text-xs whitespace-nowrap text-ink-500">{fmtDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {counts.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={ClipboardCheck} title="No stock counts yet" description={manage ? "Start a count to compare what is on your shelves with what the system expects." : "Stock counts done by your outlet will appear here."} />
        </div>
      )}
    </>
  );
}
