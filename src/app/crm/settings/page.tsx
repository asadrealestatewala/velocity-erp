import Link from "next/link";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { getSettings } from "@/server/settings";
import { smtpConfigured } from "@/server/services/notifications";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { CitiesPanel, CustomFieldsPanel, GamificationPanel, NamedListPanel, OperationsPanel, PrivacyPanel, StagesPanel } from "./settings-panels";

export const metadata = { title: "Settings" };

const TABS = [
  ["pipeline", "Pipeline"], ["locations", "Cities & provinces"], ["fields", "Custom fields"], ["privacy", "Privacy & duplicates"],
  ["gamification", "Gamification & goals"], ["operations", "Notifications & system"],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("settings.manage");
  const tabParam = (await searchParams).tab;
  const tab = TABS.find(([k]) => k === tabParam)?.[0] ?? "pipeline";
  const s = await getSettings();

  return (
    <>
      <PageHeader title="Settings" description="Business rules are configurable here — nothing is hardcoded in the frontend." breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Settings" }]} />
      <nav className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-white p-1" aria-label="Settings sections">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/crm/settings?tab=${k}`} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>{l}</Link>
        ))}
      </nav>
      {tab === "pipeline" && <PipelineTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "fields" && <FieldsTab />}
      {tab === "privacy" && <Card><CardHeader title="Privacy, consent & duplicate detection" /><PrivacyPanel s={s} /></Card>}
      {tab === "gamification" && <GamificationTab s={s} />}
      {tab === "operations" && <OperationsTab s={s} />}
    </>
  );
}

async function PipelineTab() {
  const [stages, reasons, sources] = await Promise.all([
    db.leadStage.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { leads: true } } } }),
    db.lossReason.findMany({ orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader title="Pipeline stages" description="Rename, reorder, recolour and deactivate. Deactivated stages keep their history." /><StagesPanel stages={stages.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind, isActive: x.isActive, isDefault: x.isDefault, notifyOnEnter: x.notifyOnEnter, leads: x._count.leads }))} /></Card>
      <div className="space-y-4">
        <Card><CardHeader title="Loss reasons" description="Required when a lead is marked Lost" /><NamedListPanel kind="loss" items={reasons} /></Card>
        <Card><CardHeader title="Lead sources" /><NamedListPanel kind="source" items={sources.map((x) => ({ ...x, extra: x.key }))} /></Card>
      </div>
    </div>
  );
}

async function LocationsTab() {
  const [provinces, cities] = await Promise.all([
    db.province.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.city.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { dealerships: true } } } }),
  ]);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader title="Cities" description="Public forms list active cities; outlets are linked to cities on each dealership." /><CitiesPanel provinces={provinces} cities={cities.map((c) => ({ id: c.id, name: c.name, provinceId: c.provinceId, isActive: c.isActive, sortOrder: c.sortOrder, outlets: c._count.dealerships }))} /></Card>
      <Card><CardHeader title="Provinces / states" /><NamedListPanel kind="province" items={provinces} /></Card>
    </div>
  );
}

async function FieldsTab() {
  const fields = await db.customFieldDefinition.findMany({ orderBy: [{ entity: "asc" }, { sortOrder: "asc" }] });
  return <Card><CardHeader title="Custom contact fields" description="Shown on contact forms and profiles; stored without schema changes." /><CustomFieldsPanel fields={fields.map((f) => ({ id: f.id, entity: f.entity, key: f.key, label: f.label, type: f.type as "TEXT", options: (f.options as string[]) ?? [], isActive: f.isActive }))} /></Card>;
}

async function GamificationTab({ s }: { s: Awaited<ReturnType<typeof getSettings>> }) {
  const [achievements, goals, dealerships] = await Promise.all([
    db.achievement.findMany({ orderBy: { createdAt: "asc" } }),
    db.goal.findMany({ where: { endsAt: { gte: new Date(Date.now() - 31 * 86400_000) } }, orderBy: { endsAt: "desc" }, include: { dealership: { select: { name: true } } }, take: 100 }),
    db.dealership.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <Card>
      <CardHeader title="Gamification" description="Points, badges and targets are calculated from auditable business events only." />
      <GamificationPanel
        s={s}
        achievements={achievements.map((a) => ({ id: a.id, name: a.name, description: a.description, isActive: a.isActive, criteria: a.criteria as { eventType?: string; count?: number; totalPoints?: number } }))}
        goals={goals.map((g) => ({ id: g.id, name: g.name, metric: g.metric, targetValue: Number(g.targetValue), dealership: g.dealership?.name ?? null, startsAt: g.startsAt.toISOString().slice(0, 10), endsAt: g.endsAt.toISOString().slice(0, 10) }))}
        dealerships={dealerships}
      />
    </Card>
  );
}

async function OperationsTab({ s }: { s: Awaited<ReturnType<typeof getSettings>> }) {
  const outbox = await db.outboxMessage.groupBy({ by: ["status"], _count: { _all: true } });
  return (
    <Card>
      <CardHeader title="Notifications, booking rules & system" />
      <OperationsPanel s={s} status={{ smtp: smtpConfigured(), storage: process.env.STORAGE_DRIVER === "s3" ? "S3-compatible" : "Local disk (development)", outbox: Object.fromEntries(outbox.map((o) => [o.status, o._count._all])) }} />
    </Card>
  );
}
