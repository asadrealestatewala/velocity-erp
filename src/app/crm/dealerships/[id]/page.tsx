import Link from "next/link";
import { notFound } from "next/navigation";
import { subDays } from "date-fns";
import { Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { getDealershipPerformance } from "@/server/services/analytics";
import { Badge, Card, CardHeader, DescriptionList, PageHeader, StageBadge, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ModelsEditor, StatusControls, TeamPanel } from "@/components/dealerships/dealership-controls";
import { fmtDate, fmtDateTime, fmtMoney, fullName, humanize } from "@/lib/utils";
import { DEALERSHIP_STATUS, ORIGIN_LABEL, TEST_DRIVE_STATUS } from "@/lib/constants";
import { Bike, CheckCircle2, Footprints, Target, Users } from "lucide-react";

export const metadata = { title: "Dealership" };

export default async function DealershipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCentralPage("dealerships.view");
  const { id } = await params;
  const d = await db.dealership.findUnique({
    where: { id },
    include: {
      city: true, province: true, parent: { select: { id: true, name: true } }, children: { select: { id: true, name: true } },
      application: { select: { id: true, number: true, businessName: true } },
      memberships: { orderBy: [{ isActive: "desc" }, { role: "asc" }], include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } } },
      bikeModels: { select: { bikeModelId: true } },
    },
  });
  if (!d) notFound();
  const manage = can(user, "dealerships.manage");
  const range = { from: subDays(new Date(), 30), to: new Date() };
  const [models, perf, leadsOpen, walkIns, company, recentLeads, testDrives, history] = await Promise.all([
    db.bikeModel.findMany({ orderBy: { displayOrder: "asc" }, select: { id: true, name: true, isActive: true } }),
    getDealershipPerformance(range, [id]),
    db.lead.count({ where: { dealershipId: id, stage: { kind: "OPEN" }, isArchived: false } }),
    db.lead.count({ where: { dealershipId: id, origin: "DEALERSHIP_WALK_IN" } }),
    db.lead.count({ where: { dealershipId: id, origin: "COMPANY" } }),
    db.lead.findMany({ where: { dealershipId: id }, orderBy: { createdAt: "desc" }, take: 8, include: { contact: { select: { id: true, firstName: true, lastName: true } }, stage: true, assignedUser: { select: { name: true } } } }),
    db.testDriveBooking.findMany({ where: { dealershipId: id, scheduledAt: { gte: subDays(new Date(), 1) } }, orderBy: { scheduledAt: "asc" }, take: 6, include: { contact: { select: { id: true, firstName: true, lastName: true } }, bikeModel: { select: { name: true } } } }),
    db.auditLog.findMany({ where: { entityType: "Dealership", entityId: id }, orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }),
  ]);
  const p = perf[0];
  const hours = (d.operatingHours ?? {}) as Record<string, { open: string; close: string; closed?: boolean }>;

  return (
    <>
      <PageHeader
        title={d.name}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{d.code}</span>· {humanize(d.type)} · {d.city.name}<Badge tone={DEALERSHIP_STATUS[d.status]!.tone}>{DEALERSHIP_STATUS[d.status]!.label}</Badge>{d.acceptsLeads ? <Badge tone="green" dot="#16a34a">Receiving leads</Badge> : <Badge tone="gray">Not receiving leads</Badge>}</span>}
        breadcrumbs={[{ label: "Dealerships", href: "/crm/dealerships" }, { label: d.name }]}
        actions={manage ? <><StatusControls id={d.id} status={d.status} acceptsLeads={d.acceptsLeads} /><ButtonLink href={`/crm/dealerships/${d.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" /> Edit</ButtonLink></> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Open leads" value={leadsOpen} icon={Users} href={`/crm/contacts?dealership=${d.id}`} />
        <StatCard label="Company-assigned (all time)" value={company} icon={Target} tone="blue" />
        <StatCard label="Walk-ins (all time)" value={walkIns} icon={Footprints} tone="violet" />
        <StatCard label="Converted (30d)" value={p?.converted ?? 0} icon={CheckCircle2} tone="green" hint={`${p?.conversionRate ?? 0}% rate`} />
        <StatCard label="Test drives done (30d)" value={p?.testDrivesCompleted ?? 0} icon={Bike} tone="amber" hint={p?.avgResponseHours != null ? `avg response ${p.avgResponseHours}h` : undefined} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <DescriptionList
                cols={3}
                items={[
                  { label: "Legal name", value: d.legalName }, { label: "Primary contact", value: d.contactName }, { label: "Email", value: d.email },
                  { label: "Phone", value: d.phone }, { label: "Province", value: d.province?.name }, { label: "City", value: d.city.name },
                  { label: "Address", value: d.address }, { label: "Postal code", value: d.postalCode },
                  { label: "Coordinates", value: d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : null },
                  { label: "Opening date", value: fmtDate(d.openingDate) },
                  { label: "Parent", value: d.parent ? <Link className="link" href={`/crm/dealerships/${d.parent.id}`}>{d.parent.name}</Link> : null },
                  { label: "Sub-outlets", value: d.children.map((c) => c.name).join(", ") || null },
                  { label: "Rep lead visibility", value: d.repsSeeAllLeads ? "All dealership leads" : "Own leads only" },
                  { label: "Slot capacity", value: d.testDriveSlotCapacity ? `${d.testDriveSlotCapacity} per 30 min` : "No limit" },
                  { label: "Related application", value: d.application ? <Link className="link" href={`/crm/applications/${d.application.id}`}>#{d.application.number} · {d.application.businessName}</Link> : null },
                  { label: "Operating hours", value: Object.keys(hours).length ? Object.entries(hours).map(([k, h]) => `${k.slice(0, 1).toUpperCase()}${k.slice(1)} ${h.closed ? "closed" : `${h.open}–${h.close}`}`).join(" · ") : "Not enforced" },
                ]}
              />
              {d.notes && <p className="mt-4 rounded-xl bg-ink-50 p-3 text-sm whitespace-pre-line text-ink-700">{d.notes}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Recent leads" action={<Link href={`/crm/contacts?dealership=${d.id}`} className="text-xs font-medium text-brand-600 hover:underline">All →</Link>} />
            <ul className="divide-y divide-ink-100">
              {recentLeads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/crm/contacts/${l.contact.id}?lead=${l.id}`} className="link flex-1">{fullName(l.contact)}</Link>
                  <Badge tone={l.origin === "COMPANY" ? "blue" : "brand"}>{ORIGIN_LABEL[l.origin]}</Badge>
                  <StageBadge name={l.stage.name} color={l.stage.color} />
                  <span className="w-28 truncate text-xs text-ink-500">{l.assignedUser?.name ?? "No rep"}</span>
                  <span className="text-xs text-ink-400">{fmtDate(l.createdAt)}</span>
                </li>
              ))}
              {recentLeads.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No leads yet.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Upcoming test drives" action={<Link href={`/crm/test-drives?dealership=${d.id}`} className="text-xs font-medium text-brand-600 hover:underline">All →</Link>} />
            <ul className="divide-y divide-ink-100">
              {testDrives.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-40 text-xs text-ink-500">{fmtDateTime(t.scheduledAt)}</span>
                  <Link href={`/crm/contacts/${t.contact.id}`} className="link flex-1">{fullName(t.contact)}</Link>
                  <span className="text-xs text-ink-500">{t.bikeModel.name}</span>
                  <Badge tone={TEST_DRIVE_STATUS[t.status]!.tone}>{TEST_DRIVE_STATUS[t.status]!.label}</Badge>
                </li>
              ))}
              {testDrives.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">Nothing scheduled.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Team" description="Portal users with access to this dealership" />
            {manage ? (
              <TeamPanel dealershipId={d.id} members={d.memberships} canAppointManagers meId={user.id} />
            ) : (
              <ul className="divide-y divide-ink-100">{d.memberships.filter((m) => m.isActive).map((m) => <li key={m.id} className="px-5 py-2.5 text-sm">{m.user.name} · <span className="text-ink-500">{m.role === "MANAGER" ? "Manager" : "Sales rep"}</span></li>)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Eligible bike models" description="Only these models can be booked here" />
            {manage ? <ModelsEditor id={d.id} models={models} selected={d.bikeModels.map((b) => b.bikeModelId)} /> : <p className="p-5 text-sm">{models.filter((m) => d.bikeModels.some((b) => b.bikeModelId === m.id)).map((m) => m.name).join(", ") || "None"}</p>}
          </Card>
          <Card>
            <CardHeader title="Change history" />
            <ol className="max-h-80 space-y-2.5 overflow-y-auto p-5">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="text-ink-800">{humanize(h.action.split(".")[1] ?? h.action)}</p>
                  <p className="text-xs text-ink-400">{h.user?.name ?? "System"} · {fmtDateTime(h.createdAt)}</p>
                </li>
              ))}
              {history.length === 0 && <p className="text-sm text-ink-400">No recorded changes.</p>}
            </ol>
          </Card>
          {p && <p className="px-1 text-xs text-ink-400">30-day revenue (recognised): {fmtMoney(p.revenue)}</p>}
        </div>
      </div>
    </>
  );
}
