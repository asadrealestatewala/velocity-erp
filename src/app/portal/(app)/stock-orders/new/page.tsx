import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { listShowroomStock, stockableCatalog } from "@/server/services/inventory";
import { PageHeader } from "@/components/ui/misc";
import { StockOrderForm } from "@/components/procurement/stock-order-form";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { sp } from "@/lib/utils";

export const metadata = { title: "New stock order" };

export default async function NewStockOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("procurement.order");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const [catalog, stock] = await Promise.all([stockableCatalog(), listShowroomStock(dealershipId)]);
  const have = new Map(stock.map((s) => [s.key, s]));
  const items = catalog
    .map((c) => ({
      key: c.key, kind: c.kind, name: c.name, code: c.code, category: c.category, dealerPrice: c.dealerPrice, currency: c.currency,
      inStock: have.get(c.key)?.quantity ?? 0, reorderLevel: have.get(c.key)?.reorderLevel ?? 0,
    }));
  // Items that are low or out of stock are pre-selected when arriving from a low-stock alert.
  const presetKeys = sp(params.low) ? items.filter((i) => i.reorderLevel > 0 ? i.inStock <= i.reorderLevel : false).map((i) => i.key) : [];
  return (
    <>
      <PageHeader
        title="New stock order"
        description="Tell YADEA procurement what you need. Prices come from the catalogue where set, otherwise procurement confirms them on approval."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock orders", href: "/portal/stock-orders" }, { label: "New" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <StockOrderForm dealershipId={dealershipId} items={items} presetKeys={presetKeys} />
    </>
  );
}
