import { notFound } from "next/navigation";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { db } from "@/lib/db";
import { Badge, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { CountSheet } from "@/components/stock/count-controls";
import { STOCK_COUNT_STATUS } from "@/lib/ops-constants";
import { fmtDateTime, sp } from "@/lib/utils";

export const metadata = { title: "Stock count" };

export default async function StockCountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const dealershipId = activeDealershipId(user, sp((await searchParams).dealership))!;
  const c = await db.stockCount.findFirst({
    where: { id, dealershipId },
    include: { startedBy: { select: { name: true } }, lines: { include: { item: { include: { bikeModel: { select: { name: true, code: true } }, product: { select: { name: true, sku: true } } } } } } },
  });
  if (!c) notFound();
  const lines = c.lines
    .map((l) => ({ id: l.id, name: l.item.bikeModel?.name ?? l.item.product?.name ?? "Item", code: l.item.bikeModel?.code ?? l.item.product?.sku ?? "", expected: l.expectedQuantity, counted: l.countedQuantity, note: l.note }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const meta = STOCK_COUNT_STATUS[c.status]!;
  const editable = c.status === "IN_PROGRESS" && can(user, "inventory.manage");
  return (
    <>
      <PageHeader
        title={`Stock count SC-${c.number}${c.title ? ` — ${c.title}` : ""}`}
        description={`Started ${fmtDateTime(c.createdAt)} by ${c.startedBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock counts", href: "/portal/stock-counts" }, { label: `SC-${c.number}` }]}
        actions={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />
      {editable ? (
        <CountSheet dealershipId={dealershipId} countId={c.id} lines={lines} />
      ) : (
        <TableWrap>
          <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Expected</th><th className="th text-right">Counted</th><th className="th text-right">Difference</th></tr></thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {lines.map((l) => {
              const diff = l.counted === null ? null : l.counted - l.expected;
              return (
                <tr key={l.id}>
                  <td className="td font-medium text-ink-900">{l.name}</td>
                  <td className="td font-mono text-xs">{l.code}</td>
                  <td className="td text-right tabular-nums">{l.expected}</td>
                  <td className="td text-right tabular-nums">{l.counted ?? "—"}</td>
                  <td className={`td text-right tabular-nums font-semibold ${diff ? (diff < 0 ? "text-red-600" : "text-green-700") : "text-ink-400"}`}>{diff === null ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
