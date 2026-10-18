import Link from "next/link";
import { Boxes } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProcurementPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { STOCK_STATE, stockState } from "@/lib/ops-constants";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Dealer stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireProcurementPage("inventory.view_all");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 50 });
  const where: Prisma.InventoryItemWhereInput = {
    ...(p.dealership ? { dealershipId: p.dealership } : {}),
    ...(p.type === "bikes" ? { bikeModelId: { not: null } } : p.type === "parts" ? { productId: { not: null } } : {}),
    ...(p.q ? { OR: [{ bikeModel: { name: { contains: p.q, mode: "insensitive" } } }, { product: { name: { contains: p.q, mode: "insensitive" } } }, { product: { sku: { contains: p.q, mode: "insensitive" } } }] } : {}),
  };
  // "Low" is a comparison between two columns, which Prisma can't express — filter that one in SQL.
  let idFilter: Prisma.InventoryItemWhereInput = {};
  if (p.state === "low") {
    const ids = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryItem" WHERE "quantity" <= "reorderLevel" AND "reorderLevel" > 0`;
    idFilter = { id: { in: ids.map((r) => r.id) } };
  } else if (p.state === "out") idFilter = { quantity: 0 };
  const full = { AND: [where, idFilter] };

  const [rows, total, dealerships] = await Promise.all([
    db.inventoryItem.findMany({
      where: full, skip, take: pageSize, orderBy: [{ dealership: { name: "asc" } }, { updatedAt: "desc" }],
      include: { dealership: { select: { id: true, name: true } }, bikeModel: { select: { name: true, code: true } }, product: { select: { name: true, sku: true } } },
    }),
    db.inventoryItem.count({ where: full }),
    db.dealership.findMany({ where: { inventory: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Dealer stock" description="What each showroom holds right now — bikes and spare parts — so you can see who needs replenishing." breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Dealer stock" }]} />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Model, part or SKU" },
        { type: "select", name: "dealership", label: "Any dealership", options: dealerships.map((d) => ({ value: d.id, label: d.name })) },
        { type: "select", name: "type", label: "Bikes & parts", options: [{ value: "bikes", label: "Bike models" }, { value: "parts", label: "Spare parts" }] },
        { type: "select", name: "state", label: "Any stock level", options: [{ value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }] },
      ]} />
      <TableWrap footer={<Pagination base="/procurement/stock" params={p} page={page} pageSize={pageSize} total={total} sizes={[50, 100]} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Dealership</th><th className="th">Item</th><th className="th">Type</th><th className="th text-right">In stock</th><th className="th text-right">Reorder level</th><th className="th">Status</th><th className="th">Updated</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((r) => {
            const st = STOCK_STATE[stockState(r.quantity, r.reorderLevel)];
            return (
              <tr key={r.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/procurement/dealers/${r.dealership.id}?tab=stock`} className="link">{r.dealership.name}</Link></td>
                <td className="td"><span className="font-medium text-ink-900">{r.bikeModel?.name ?? r.product?.name}</span><span className="ml-2 font-mono text-xs text-ink-400">{r.bikeModel?.code ?? r.product?.sku}</span></td>
                <td className="td">{r.bikeModelId ? "Bike" : "Spare part"}</td>
                <td className="td text-right font-semibold tabular-nums">{r.quantity}</td>
                <td className="td text-right tabular-nums text-ink-500">{r.reorderLevel || "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td whitespace-nowrap text-xs text-ink-500">{fmtDate(r.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={Boxes} title="No stock records" description="Dealerships appear here once they add items to their showroom inventory." /></div>}
    </>
  );
}
