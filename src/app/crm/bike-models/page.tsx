import { Bike } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { Badge, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { fmtMoney, humanize } from "@/lib/utils";
import { ModelDialog } from "./model-dialog";

export const metadata = { title: "Bike models" };

export default async function BikeModelsPage() {
  const user = await requireCentralPage("dealerships.view");
  const manage = can(user, "bikemodels.manage");
  const models = await db.bikeModel.findMany({
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }],
    include: { _count: { select: { dealerships: true, leads: true, testDrives: true } } },
  });
  return (
    <>
      <PageHeader
        title="Bike models"
        description="Administrator-managed catalogue. Public forms read active models from here."
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Bike models" }]}
        actions={manage ? <ModelDialog /> : undefined}
      />
      {models.some((m) => m.isSeedExample) && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Models marked <b>Seed example</b> are fictional demo records. Replace them with official YADEA product data — no official specifications or prices were invented.
        </p>
      )}
      <TableWrap>
        <thead className="bg-ink-50/60">
          <tr><th className="th">Model</th><th className="th">Code</th><th className="th">Category</th><th className="th">Price</th><th className="th">Availability</th><th className="th">Status</th><th className="th text-right">Outlets</th><th className="th text-right">Leads</th><th className="th text-right">Test drives</th><th className="th sr-only">Edit</th></tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {models.map((m) => (
            <tr key={m.id} className="hover:bg-ink-50/50">
              <td className="td">
                <div className="flex items-center gap-3">
                  {m.imageFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${m.imageFileId}`} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-400"><Bike className="h-5 w-5" /></span>
                  )}
                  <div><p className="font-medium text-ink-900">{m.name}</p>{m.isSeedExample && <Badge tone="amber">Seed example</Badge>}</div>
                </div>
              </td>
              <td className="td font-mono text-xs">{m.code}</td>
              <td className="td">{m.category ?? "—"}</td>
              <td className="td">{m.price ? fmtMoney(m.price.toString(), m.currency) : <span className="text-ink-400">Not set</span>}</td>
              <td className="td">{humanize(m.availability)}</td>
              <td className="td">{m.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</td>
              <td className="td text-right tabular-nums">{m._count.dealerships}</td>
              <td className="td text-right tabular-nums">{m._count.leads}</td>
              <td className="td text-right tabular-nums">{m._count.testDrives}</td>
              <td className="td text-right">
                {manage && (
                  <ModelDialog
                    id={m.id}
                    initial={{
                      name: m.name, code: m.code, category: m.category, description: m.description, specifications: m.specifications as Record<string, string>,
                      price: m.price ? Number(m.price) : null, currency: m.currency, availability: m.availability, displayOrder: m.displayOrder, isActive: m.isActive,
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
