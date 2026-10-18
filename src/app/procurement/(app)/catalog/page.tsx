import { Bike, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireProcurementPage } from "@/server/authz";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { BikePriceDialog, ProductDialog } from "@/components/procurement/catalog-dialogs";
import { fmtMoney } from "@/lib/utils";

export const metadata = { title: "Product catalogue" };

export default async function CatalogPage() {
  await requireProcurementPage("catalog.manage");
  const [models, parts] = await Promise.all([
    db.bikeModel.findMany({ orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }] }),
    db.product.findMany({ orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader
        title="Product catalogue"
        description="What dealerships can stock and order: bike models and spare parts, with the prices YADEA charges dealers."
        breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Catalogue" }]}
        actions={<ProductDialog />}
      />
      {(models.some((m) => m.isSeedExample) || parts.some((p) => p.isSeedExample)) && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Items marked <b>Seed example</b> are placeholders created for the demo. Replace them with official YADEA part data and prices — no official prices or specifications were invented.
        </p>
      )}

      <Card className="mb-6">
        <CardHeader title="Bike models" description="Add or edit models under CRM → Bike models. Set the prices dealers pay here." />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-ink-50/60"><tr><th className="th">Model</th><th className="th">Code</th><th className="th text-right">Retail price</th><th className="th text-right">Dealer price</th><th className="th">Status</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {models.map((m) => (
                <tr key={m.id} className="hover:bg-ink-50/50">
                  <td className="td"><span className="flex items-center gap-2 font-medium text-ink-900"><Bike className="h-4 w-4 text-ink-400" />{m.name}</span></td>
                  <td className="td font-mono text-xs">{m.code}</td>
                  <td className="td text-right tabular-nums">{m.price ? fmtMoney(m.price.toString(), m.currency) : <span className="text-ink-400">Not set</span>}</td>
                  <td className="td text-right tabular-nums">{m.dealerPrice ? fmtMoney(m.dealerPrice.toString(), m.currency) : <span className="text-ink-400">Not set</span>}</td>
                  <td className="td">{m.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td className="td text-right"><BikePriceDialog id={m.id} name={m.name} price={m.price ? Number(m.price) : null} dealerPrice={m.dealerPrice ? Number(m.dealerPrice) : null} /></td>
                </tr>
              ))}
              {models.length === 0 && <tr><td colSpan={6}><EmptyState icon={Bike} title="No bike models" description="Add models under CRM → Bike models." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Spare parts" description={`${parts.length} part${parts.length === 1 ? "" : "s"} in the catalogue`} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-ink-50/60"><tr><th className="th">Part</th><th className="th">SKU</th><th className="th">Category</th><th className="th text-right">Retail price</th><th className="th text-right">Dealer price</th><th className="th">Status</th><th className="th"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {parts.map((p) => (
                <tr key={p.id} className="hover:bg-ink-50/50">
                  <td className="td"><span className="flex items-center gap-2 font-medium text-ink-900"><Wrench className="h-4 w-4 text-ink-400" />{p.name}</span>{p.isSeedExample && <Badge tone="amber" className="mt-1">Seed example</Badge>}</td>
                  <td className="td font-mono text-xs">{p.sku}</td>
                  <td className="td">{p.category ?? "—"}</td>
                  <td className="td text-right tabular-nums">{p.price ? fmtMoney(p.price.toString(), p.currency) : <span className="text-ink-400">Not set</span>}</td>
                  <td className="td text-right tabular-nums">{p.dealerPrice ? fmtMoney(p.dealerPrice.toString(), p.currency) : <span className="text-ink-400">Not set</span>}</td>
                  <td className="td">{p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td className="td text-right">
                    <ProductDialog id={p.id} initial={{ sku: p.sku, name: p.name, category: p.category, description: p.description, unit: p.unit, price: p.price ? Number(p.price) : null, dealerPrice: p.dealerPrice ? Number(p.dealerPrice) : null, currency: p.currency, isActive: p.isActive }} />
                  </td>
                </tr>
              ))}
              {parts.length === 0 && <tr><td colSpan={7}><EmptyState icon={Wrench} title="No spare parts yet" description="Add the spare parts dealerships can stock and order." action={<ProductDialog />} /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
