import Link from "next/link";
import { notFound } from "next/navigation";
import { dealershipIds, can, requirePortalPage } from "@/server/authz";
import { findJobCard } from "@/server/services/service-workshop";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { JobCardEditor, JobCardStatusButtons, PartsPanel, RaiseClaimButton, type JobDetails } from "@/components/service/job-card-controls";
import { INVENTORY_REASON, JOB_CARD_EDITABLE, JOB_CARD_STATUS, WARRANTY_CLAIM_STATUS } from "@/lib/ops-constants";
import { listShowroomStock } from "@/server/services/inventory";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/utils";

export const metadata = { title: "Job card" };

export default async function JobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("service.view");
  const { id } = await params;
  const job = await findJobCard({ id, dealershipId: { in: dealershipIds(user) } });
  if (!job) notFound();
  const canManage = can(user, "service.manage");
  const editable = canManage && (JOB_CARD_EDITABLE as readonly string[]).includes(job.status);
  const [technicians, stock, movements] = await Promise.all([
    db.dealershipMembership.findMany({ where: { dealershipId: job.dealershipId, isActive: true, user: { isActive: true } }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
    editable ? listShowroomStock(job.dealershipId) : Promise.resolve([]),
    db.inventoryMovement.findMany({ where: { refType: "JobCard", refId: job.id }, orderBy: { createdAt: "asc" }, include: { item: { include: { product: true } } } }),
  ]);
  const st = JOB_CARD_STATUS[job.status]!;
  const details: JobDetails = {
    id: job.id, status: job.status, isWarranty: job.isWarranty, diagnosis: job.diagnosis ?? "", workDone: job.workDone ?? "", odometerKm: job.odometerKm?.toString() ?? "",
    labourCharge: Number(job.labourCharge), discount: Number(job.discount), technicianId: job.technicianId ?? "", currency: job.currency, partsTotal: Number(job.partsTotal), total: Number(job.total),
  };
  const parts = job.parts.map((p) => ({ id: p.id, name: p.name, code: p.code, quantity: p.quantity, unitPrice: Number(p.unitPrice), lineTotal: Number(p.lineTotal) }));
  const liveClaim = job.claims.find((c) => c.status !== "REJECTED");

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Job card JC-{job.number} <Badge tone={st.tone}>{st.label}</Badge>{job.isWarranty && <Badge tone="violet">Warranty</Badge>}</span>}
        description={`Opened ${fmtDateTime(job.openedAt)} by ${job.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service", href: "/portal/service" }, { label: `JC-${job.number}` }]}
        actions={canManage ? <JobCardStatusButtons job={details} /> : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <JobCardEditor key={`${job.updatedAt.toISOString()}`} job={details} technicians={technicians.map((t) => t.user)} editable={editable} canWarranty={can(user, "warranty.manage")} />
          <PartsPanel job={details} parts={parts} editable={editable} stock={stock.filter((s) => s.kind === "PART" && s.quantity > 0).map((s) => ({ id: s.key.slice(2), name: s.name, code: s.code, quantity: s.quantity, price: s.price ? Number(s.price) : null }))} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer & vehicle" />
            <div className="p-5">
              <DescriptionList cols={1} items={[
                { label: "Customer", value: job.contact ? <Link className="link" href={`/portal/contacts/${job.contact.id}`}>{fullName(job.contact)}</Link> : job.customerName },
                { label: "Phone", value: job.customerPhone ?? job.contact?.phone ?? "—" },
                { label: "Vehicle", value: job.vehicleLabel ?? "—" },
                { label: "Number plate", value: job.plateNumber ?? "—" },
                { label: "Chassis / VIN", value: job.vehicle ? <Link className="link font-mono text-xs" href={`/portal/vehicles/${job.vehicle.id}`}>{job.vehicle.chassisNumber}</Link> : job.chassisNo ?? "—" },
                { label: "Complaint", value: job.complaint },
                { label: "Technician", value: job.technician?.name ?? "—" },
                ...(job.completedAt ? [{ label: "Ready", value: fmtDateTime(job.completedAt) }] : []),
                ...(job.deliveredAt ? [{ label: "Delivered", value: fmtDateTime(job.deliveredAt) }] : []),
                ...(job.status === "CANCELLED" ? [{ label: "Cancelled", value: `${fmtDate(job.cancelledAt)}${job.cancelReason ? ` — ${job.cancelReason}` : ""}` }] : []),
              ]} />
            </div>
          </Card>
          {job.isWarranty && (
            <Card>
              <CardHeader title="Warranty claim" description="Cost of this job is claimed from YADEA." />
              <div className="space-y-3 p-5 text-sm">
                {job.claims.length === 0 && <p className="text-ink-500">No claim raised yet.</p>}
                {job.claims.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[13px]">WC-{c.number}</span>
                    <span className="tabular-nums">{fmtMoney(c.claimAmount.toString(), c.currency)}</span>
                    <Badge tone={WARRANTY_CLAIM_STATUS[c.status]!.tone}>{WARRANTY_CLAIM_STATUS[c.status]!.label}</Badge>
                  </div>
                ))}
                {can(user, "warranty.manage") && !liveClaim && job.status !== "CANCELLED" && <RaiseClaimButton jobCardId={job.id} parts={parts} />}
                {job.claims.length > 0 && <Link className="link text-xs" href="/portal/warranty">Open warranty claims</Link>}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Stock impact" description="Changes this job made to your inventory" />
            <ul className="divide-y divide-ink-100 text-sm">
              {movements.length === 0 && <li className="px-5 py-4 text-ink-500">No parts have been used on this job.</li>}
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span><span className="font-medium text-ink-900">{m.item.product?.name}</span><span className="block text-xs text-ink-500">{INVENTORY_REASON[m.reason]} · {fmtDateTime(m.createdAt)}</span></span>
                  <Badge tone={m.delta < 0 ? "red" : "green"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
