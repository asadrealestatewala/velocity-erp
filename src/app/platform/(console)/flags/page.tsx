import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { archiveFlagAction, saveFlagAction } from "@/server/actions/platform";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";

export const metadata = { title: "Feature flags" };

export default async function FlagsPage() {
  await requireAdminPage("flags.manage");
  const flags = await platformDb().featureFlag.findMany({ orderBy: [{ isArchived: "asc" }, { key: "asc" }], include: { _count: { select: { overrides: true } } } });
  return (
    <>
      <PageHeader title="Feature flags" description="Switch beta or optional features on for everyone, for certain plans, for a percentage of workspaces, or for a single workspace (set on the workspace's page). A workspace's own exception always wins." />
      <Card>
        <ul className="divide-y divide-ink-100 text-sm">
          {flags.map((f) => {
            const plans = (f.planKeys as string[]) ?? [];
            return (
              <li key={f.key} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium"><code>{f.key}</code> · {f.name} {f.isArchived ? <Badge tone="gray">archived</Badge> : f.enabled ? <Badge tone="green">on for everyone</Badge> : <Badge tone="amber">limited</Badge>}</p>
                  {f.description && <p className="text-ink-600">{f.description}</p>}
                  <p className="text-xs text-ink-500">Plans: {plans.length ? plans.join(", ") : "none"} · rollout {f.rolloutPercent}% · {f._count.overrides} workspace exception{f._count.overrides === 1 ? "" : "s"}</p>
                </div>
                <RunButton label={f.isArchived ? "Restore" : "Archive"} variant="ghost" action={archiveFlagAction.bind(null, f.key, !f.isArchived)} />
              </li>
            );
          })}
          {!flags.length && <li className="px-5 py-4 text-ink-500">No flags yet. Create one below, then check it in code with <code>isFeatureOn(&quot;your-flag&quot;)</code>.</li>}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Create or update a flag" description="Using an existing key updates that flag." />
        <div className="p-5">
          <ActionForm
            submitLabel="Save flag"
            reset
            action={saveFlagAction}
            fields={[
              { name: "key", label: "Key (used in code)", placeholder: "new-reports" },
              { name: "name", label: "Name" },
              { name: "description", label: "What it controls", optional: true },
              { name: "enabled", label: "On for everyone", type: "checkbox", defaultValue: false },
              { name: "planKeys", label: "On for these plans (comma separated)", placeholder: "growth, enterprise", optional: true },
              { name: "rolloutPercent", label: "Also on for this % of workspaces (stable)", type: "number", defaultValue: 0 },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
