import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { vehicleInclude } from "@/server/services/vehicles";
import { Badge, Card, CardHeader, DescriptionList, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { JOB_CARD_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney, fullName } from "@/lib/utils";
import { Wrench } from "lucide-react";

export const metadata = { title: "Vehicle" };

const REG = { NOT_REGISTERED: "Not registered", APPLIED: "Applied", REGISTERED: "Registered" } as const;

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const v = await db.vehicle.findFirst({ where: { id, dealershipId: { in: dealershipIds(user) } }, include: vehicleInclude });
  if (!v) notFound();
  const showService = can(user, "service.view");
  const jobs = showService
    ? await db.jobCard.findMany({ where: { vehicleId: v.id }, orderBy: { openedAt: "desc" }, take: 100, select: { id: true, number: true, openedAt: true, status: true, complaint: true, odometerKm: true, isWarranty: true, total: true, currency: true } })
    : [];

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{v.chassisNumber}</span>}
        description={v.bikeModel.name}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Vehicles", href: "/portal/vehicles" }, { label: v.chassisNumber }]}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Vehicle" />
          <div className="p-5">
            <DescriptionList cols={1} items={[
              { label: "Model", value: `${v.bikeModel.name}${v.color ? ` · ${v.color}` : ""}` },
              { label: "Engine no.", value: v.engineNumber ?? "—" },
              { label: "Owner", value: v.ownerContact ? <Link className="link" href={`/portal/contacts/${v.ownerContact.id}`}>{fullName(v.ownerContact)}</Link> : "—" },
              { label: "Number plate", value: v.plateNumber ?? REG[v.registrationStatus] },
              { label: "Added", value: fmtDate(v.createdAt) },
            ]} />
          </div>
        </Card>
        <div className="xl:col-span-2">
          <Card>
            <CardHeader title="Service history" description="Job cards raised for this vehicle." />
            {!showService || jobs.length === 0 ? (
              <EmptyState icon={Wrench} title="No service history yet" description={showService ? "Job cards appear here when the chassis number or plate matches this vehicle." : "You don't have access to service records."} />
            ) : (
              <TableWrap>
                <thead className="bg-ink-50/60">
                  <tr><th className="th">Job card</th><th className="th">Opened</th><th className="th">Complaint</th><th className="th">Odometer</th><th className="th">Status</th><th className="th text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100 bg-white">
                  {jobs.map((j) => {
                    const st = JOB_CARD_STATUS[j.status]!;
                    return (
                      <tr key={j.id} className="hover:bg-ink-50/50">
                        <td className="td"><Link className="link" href={`/portal/service/${j.id}`}>JC-{j.number}</Link>{j.isWarranty && <Badge tone="violet">Warranty</Badge>}</td>
                        <td className="td whitespace-nowrap text-xs text-ink-500">{fmtDate(j.openedAt)}</td>
                        <td className="td max-w-xs truncate">{j.complaint}</td>
                        <td className="td">{j.odometerKm != null ? `${j.odometerKm.toLocaleString()} km` : "—"}</td>
                        <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="td text-right">{j.isWarranty ? "—" : fmtMoney(Number(j.total), j.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
