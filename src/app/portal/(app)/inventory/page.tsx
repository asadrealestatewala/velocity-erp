import Link from "next/link";
import { AlertTriangle, Bike, Boxes, PackageX, Wrench } from "lucide-react";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { listShowroomStock, stockableCatalog } from "@/server/services/inventory";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { ButtonLink } from "@/components/ui/button";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { AddStockItemDialog, AdjustStockDialog, MovementsDialog } from "@/components/inventory/stock-dialogs";
import { STOCK_STATE, stockState } from "@/lib/ops-constants";
import { cn, fmtDate, fmtMoney, sp } from "@/lib/utils";

export const metadata = { title: "Showroom inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const dealershipName = user.memberships.find((m) => m.dealershipId === dealershipId)?.dealershipName ?? "";
  const tab = sp(params.type) === "parts" ? "parts" : "bikes";
  const manage = can(user, "inventory.manage");

  const [stock, catalog] = await Promise.all([listShowroomStock(dealershipId), manage ? stockableCatalog() : Promise.resolve([])]);
  const bikes = stock.filter((s) => s.kind === "BIKE");
  const parts = stock.filter((s) => s.kind === "PART");
  const rows = tab === "bikes" ? bikes : parts;
  const stocked = new Set(stock.map((s) => s.key));
  const addable = catalog.filter((c) => !stocked.has(c.key)).map((c) => ({ key: c.key, kind: c.kind, name: c.name, code: c.code }));
  const low = stock.filter((s) => stockState(s.quantity, s.reorderLevel) === "LOW").length;
  const out = stock.filter((s) => stockState(s.quantity, s.reorderLevel) === "OUT").length;
  const units = (list: typeof stock) => list.reduce((n, s) => n + s.quantity, 0);

  const tabHref = (t: string) => `/portal/inventory?type=${t}${sp(params.dealership) ? `&dealership=${dealershipId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Showroom inventory"
        description={`${dealershipName} — bikes and spare parts on hand. Stock is deducted automatically when you confirm a customer order and added when a YADEA delivery is received.`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Inventory" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {can(user, "procurement.order") && <ButtonLink href="/portal/stock-orders/new" variant="outlineBrand">Order from YADEA</ButtonLink>}
            {manage && <AddStockItemDialog dealershipId={dealershipId} options={addable} />}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bikes in stock" value={units(bikes)} icon={Bike} hint={`${bikes.length} model${bikes.length === 1 ? "" : "s"}`} />
        <StatCard label="Spare parts in stock" value={units(parts)} icon={Wrench} tone="blue" hint={`${parts.length} part${parts.length === 1 ? "" : "s"}`} />
        <StatCard label="Low stock" value={low} icon={AlertTriangle} tone="amber" hint="At or below reorder level" />
        <StatCard label="Out of stock" value={out} icon={PackageX} tone="red" hint="Needs replenishing" />
      </div>

      <div className="mb-4 inline-flex rounded-lg bg-ink-100 p-1 text-sm font-medium" role="tablist" aria-label="Inventory type">
        {([["bikes", "Bike models", bikes.length], ["parts", "Spare parts", parts.length]] as const).map(([t, label, n]) => (
          <Link key={t} href={tabHref(t)} role="tab" aria-selected={tab === t} className={cn("rounded-md px-4 py-1.5 transition", tab === t ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>
            {label} <span className="ml-1 text-ink-400">{n}</span>
          </Link>
        ))}
      </div>

      <TableWrap>
        <thead className="bg-ink-50/60">
          <tr>
            <th className="th">{tab === "bikes" ? "Model" : "Part"}</th>
            <th className="th">Code</th>
            {tab === "parts" && <th className="th">Category</th>}
            <th className="th text-right">In stock</th>
            <th className="th text-right">Reorder level</th>
            <th className="th">Status</th>
            <th className="th">Retail price</th>
            <th className="th">Updated</th>
            <th className="th text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((s) => {
            const st = STOCK_STATE[stockState(s.quantity, s.reorderLevel)];
            return (
              <tr key={s.id} className="hover:bg-ink-50/50">
                <td className="td">
                  <div className="flex items-center gap-3">
                    {s.imageFileId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${s.imageFileId}`} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-400">{s.kind === "BIKE" ? <Bike className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}</span>
                    )}
                    <span className="font-medium text-ink-900">{s.name}</span>
                  </div>
                </td>
                <td className="td font-mono text-xs">{s.code}</td>
                {tab === "parts" && <td className="td">{s.category ?? "—"}</td>}
                <td className="td text-right text-base font-semibold tabular-nums">{s.quantity}<span className="ml-1 text-xs font-normal text-ink-400">{s.unit}</span></td>
                <td className="td text-right tabular-nums text-ink-500">{s.reorderLevel || "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td">{s.price ? fmtMoney(s.price.toString(), s.currency) : <span className="text-ink-400">Not set</span>}</td>
                <td className="td text-xs whitespace-nowrap text-ink-500">{fmtDate(s.updatedAt)}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <MovementsDialog dealershipId={dealershipId} item={{ id: s.id, name: s.name }} />
                    {manage && <AdjustStockDialog dealershipId={dealershipId} item={{ id: s.id, name: s.name, quantity: s.quantity, reorderLevel: s.reorderLevel }} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState
            icon={Boxes}
            title={tab === "bikes" ? "No bike models in your showroom yet" : "No spare parts in your showroom yet"}
            description={manage ? "Use “Add item” to record what you hold today. Orders you confirm then deduct from it automatically." : "Ask your dealership manager to add your opening stock."}
          />
        </div>
      )}
    </>
  );
}
