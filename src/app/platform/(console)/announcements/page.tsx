import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { deleteAnnouncementAction, saveAnnouncementAction, toggleAnnouncementAction } from "@/server/actions/platform";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { listPlans } from "@/server/platform/plans";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Announcements" };

const TONE = { info: "blue", warn: "amber", danger: "red" } as const;

export default async function AnnouncementsPage() {
  await requireAdminPage("announcements.manage");
  const [rows, plans, tenants] = await Promise.all([platformDb().announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 }), listPlans(), platformDb().tenant.findMany({ select: { id: true, slug: true } })]);
  const slugOf = new Map(tenants.map((t) => [t.id, t.slug]));
  const now = new Date();
  return (
    <>
      <PageHeader title="Announcements" description="Notices shown at the top of every page in customers' workspaces: maintenance windows, new features, billing changes. Customers can dismiss them." />
      <Card>
        <ul className="divide-y divide-ink-100 text-sm">
          {rows.map((r) => {
            const live = r.isActive && r.startsAt <= now && (!r.endsAt || r.endsAt >= now);
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.title} <Badge tone={TONE[r.tone as keyof typeof TONE] ?? "gray"}>{r.tone}</Badge> {live ? <Badge tone="green">live</Badge> : <Badge tone="gray">{r.isActive ? "ended" : "off"}</Badge>}</p>
                  <p className="text-ink-600">{r.body}</p>
                  <p className="text-xs text-ink-500">To {r.tenantId ? `workspace ${slugOf.get(r.tenantId) ?? "?"}` : r.planKey ? `${r.planKey} plan` : "everyone"} · from {fmtDateTime(r.startsAt)}{r.endsAt ? ` until ${fmtDateTime(r.endsAt)}` : ""} · by {r.createdBy ?? "?"}</p>
                </div>
                <div className="flex gap-2">
                  <RunButton label={r.isActive ? "Turn off" : "Turn on"} variant="ghost" action={toggleAnnouncementAction.bind(null, r.id, !r.isActive)} />
                  <RunButton label="Delete" variant="ghost" action={deleteAnnouncementAction.bind(null, r.id)} />
                </div>
              </li>
            );
          })}
          {!rows.length && <li className="px-5 py-4 text-ink-500">Nothing posted yet.</li>}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="New announcement" description="Goes live straight away. Leave both audience fields empty to reach every workspace." />
        <div className="p-5">
          <ActionForm
            submitLabel="Publish"
            reset
            action={saveAnnouncementAction}
            fields={[
              { name: "title", label: "Title", placeholder: "Scheduled maintenance on Sunday" },
              { name: "body", label: "Message", type: "textarea", placeholder: "Workspaces will be read-only from 02:00 to 02:30." },
              { name: "tone", label: "Importance", type: "select", options: [{ value: "info", label: "Information" }, { value: "warn", label: "Heads-up" }, { value: "danger", label: "Urgent" }], defaultValue: "info" },
              { name: "planKey", label: "Only this plan", type: "select", options: [{ value: "", label: "All plans" }, ...plans.map((p) => ({ value: p.key, label: p.name }))], defaultValue: "", optional: true },
              { name: "tenantCode", label: "Only this workspace (code)", optional: true },
              { name: "endsAt", label: "Show until (date)", type: "date", optional: true },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
