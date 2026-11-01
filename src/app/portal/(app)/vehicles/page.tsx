import Link from "next/link";
import { Bike } from "lucide-react";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { listVehicles } from "@/server/services/vehicles";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { AddVehicleDialog, RegistrationDialog, SellVehicleDialog } from "@/components/vehicles/vehicle-dialogs";
import { fmtDate, fullName, sp } from "@/lib/utils";

export const metadata = { title: "Vehicles" };

const STATUS = { IN_STOCK: { label: "In stock", tone: "green" }, SOLD: { label: "Sold", tone: "blue" }, DAMAGED: { label: "Damaged", tone: "red" } } as const;
const REG = { NOT_REGISTERED: "Not registered", APPLIED: "Applied", REGISTERED: "Registered" } as const;

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const q = sp(params.q) ?? "";
  const status = (["IN_STOCK", "SOLD", "DAMAGED"] as const).find((s) => s === sp(params.status));
  const manage = can(user, "inventory.manage");
  const canSell = can(user, "salesorders.manage");

  const [rows, models, orders] = await Promise.all([
    listVehicles(dealershipId, { q, status }),
    manage ? db.bikeModel.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    canSell
      ? db.salesOrder.findMany({ where: { dealershipId, status: "CONFIRMED" }, orderBy: { createdAt: "desc" }, take: 50, include: { lines: { select: { bikeModelId: true } } } })
      : Promise.resolve([]),
  ]);
  const assignable = orders.map((o) => ({ id: o.id, label: `SO-${o.number}${o.customerName ? ` · ${o.customerName}` : ""}`, bikeModelIds: o.lines.flatMap((l) => (l.bikeModelId ? [l.bikeModelId] : [])) }));

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Every bike by chassis number — who owns it and its number plate. The Inventory page still holds your stock counts."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Vehicles" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {manage && <AddVehicleDialog dealershipId={dealershipId} models={models} />}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {sp(params.dealership) && <input type="hidden" name="dealership" value={dealershipId} />}
        <input name="q" defaultValue={q} placeholder="Chassis, engine, plate or owner" aria-label="Search vehicles" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="input w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>
      <TableWrap>
        <thead className="bg-ink-50/60">
          <tr>
            <th className="th">Chassis</th><th className="th">Model</th><th className="th">Engine no.</th><th className="th">Status</th>
            <th className="th">Owner</th><th className="th">Plate</th><th className="th">Added</th><th className="th text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((v) => (
            <tr key={v.id} className="hover:bg-ink-50/50">
              <td className="td font-mono text-xs font-medium text-ink-900"><Link className="link" href={`/portal/vehicles/${v.id}`}>{v.chassisNumber}</Link></td>
              <td className="td">{v.bikeModel.name}{v.color ? <span className="text-ink-400"> · {v.color}</span> : null}</td>
              <td className="td font-mono text-xs">{v.engineNumber ?? "—"}</td>
              <td className="td"><Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge></td>
              <td className="td">{v.ownerContact ? fullName(v.ownerContact) : "—"}{v.salesOrder ? <span className="text-xs text-ink-400"> SO-{v.salesOrder.number}</span> : null}</td>
              <td className="td">{v.plateNumber ? <span className="font-mono text-xs">{v.plateNumber}</span> : <span className="text-ink-400">{REG[v.registrationStatus]}</span>}</td>
              <td className="td whitespace-nowrap text-xs text-ink-500">{fmtDate(v.createdAt)}</td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  {canSell && v.status === "IN_STOCK" && <SellVehicleDialog dealershipId={dealershipId} vehicle={v} orders={assignable} />}
                  {manage && v.status === "SOLD" && <RegistrationDialog dealershipId={dealershipId} vehicle={v} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={Bike} title={q || status ? "No vehicles match" : "No vehicles recorded yet"} description={manage ? "Add each bike by its chassis number to track its owner and number plate." : "Ask your dealership manager to record your vehicles."} />
        </div>
      )}
    </>
  );
}
