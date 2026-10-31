import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { migrateAllAction, runLifecycleAction, setMaintenanceAction } from "@/server/actions/platform";
import Link from "next/link";
import { jobHealth } from "@/server/platform/ops-log";
import { fmtDateTime } from "@/lib/utils";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { pendingMigrations } from "@/server/platform/migrate";
import { getPlatformSettings } from "@/server/platform/settings";
import { tenantDbUrl } from "@/server/platform/tenants";
import { mailConfigured } from "@/server/platform/mail";
import { stripeConfigured } from "@/server/platform/stripe";

export const metadata = { title: "System" };

export default async function SystemPage() {
  await requireAdminPage("system.manage");
  const db = platformDb();
  const week = new Date(Date.now() - 7 * 86_400_000);
  const day = new Date(Date.now() - 86_400_000);
  const [jobs, errors24h, mailFailed, tenants, s, stripe] = await Promise.all([
    jobHealth(),
    db.errorLog.count({ where: { at: { gt: day } } }),
    db.mailMessage.count({ where: { direction: "OUTBOUND", delivery: { in: ["BOUNCED", "FAILED", "COMPLAINED"] }, createdAt: { gt: week } } }),
db.tenant.findMany({ where: { status: { in: ["ACTIVE", "SUSPENDED"] } }, orderBy: { createdAt: "asc" } }), getPlatformSettings(), stripeConfigured()]);
  const rows = await Promise.all(
    tenants.map(async (t) => {
      try {
        return { t, pending: (await pendingMigrations(t.dbSchema, { connectionString: t.dbUrlEnc ? tenantDbUrl(t) : undefined })).length, error: null as string | null };
      } catch (e) {
        return { t, pending: -1, error: e instanceof Error ? e.message.slice(0, 120) : "unreachable" };
      }
    }),
  );
  const behind = rows.filter((r) => r.pending !== 0);
  return (
    <>
      <PageHeader title="System" description="Health of the platform and its workspace databases." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Health" />
          <ul className="space-y-1.5 p-5 text-sm">
            <li>Workspace databases up to date: <strong>{rows.length - behind.length} / {rows.length}</strong></li>
            <li>Email delivery: <strong>{mailConfigured() ? "configured" : "not configured (emails are only logged)"}</strong></li>
            <li>Card payments: <strong>{stripe ? "configured" : "not configured"}</strong></li>
            {jobs.map((j) => (
              <li key={j.job}>Job <code>{j.job}</code>: <strong className={j.stale || j.lastOk === false ? "text-red-700" : "text-emerald-700"}>{!j.lastRun ? "never ran: check the scheduler" : `${j.lastOk ? "ok" : "failed"} · last ${fmtDateTime(j.lastRun)}${j.stale ? " · overdue" : ""}`}</strong></li>
            ))}
            <li>Server errors in the last 24 h: <strong className={errors24h ? "text-red-700" : ""}>{errors24h}</strong> · Failed or bounced emails (7 days): <strong className={mailFailed ? "text-red-700" : ""}>{mailFailed}</strong> · <Link className="underline" href="/platform/system/logs">Open logs</Link></li>
            <li>Scheduled job secret: <strong>{process.env.CRON_SECRET ? "set" : "not set"}</strong></li>
          </ul>
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            <RunButton label="Run lifecycle job now" action={runLifecycleAction} />
            <RunButton label="Apply pending migrations to all workspaces" variant="primary" action={migrateAllAction} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Maintenance mode" description="Turns every workspace read-only (sign-in still works). Use during risky changes." />
          <div className="p-5">
            <ActionForm
              submitLabel="Save"
              action={setMaintenanceAction}
              fields={[
                { name: "on", label: "Maintenance mode is on", type: "checkbox", defaultValue: s.maintenance.on },
                { name: "message", label: "Message shown to users", type: "textarea", defaultValue: s.maintenance.message },
              ]}
            />
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Workspace databases" />
        <ul className="divide-y divide-ink-100 text-sm">
          {rows.map(({ t, pending, error }) => (
            <li key={t.id} className="flex justify-between px-5 py-2.5">
              <span>{t.name} <span className="text-ink-500">({t.slug} · {t.dbSchema})</span></span>
              <span className={pending === 0 ? "text-emerald-700" : "text-amber-700"}>{error ? `unreachable: ${error}` : pending === 0 ? "up to date" : `${pending} pending`}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
