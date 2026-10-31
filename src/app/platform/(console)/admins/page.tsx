import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { createAdminAction, signOutAdminEverywhereAction, updateAdminAction } from "@/server/actions/platform";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Platform staff" };

const ROLES = [
  { value: "OWNER", label: "Owner — everything" },
  { value: "BILLING", label: "Billing — payments, refunds, coupons" },
  { value: "SUPPORT", label: "Support — workspaces and trials" },
  { value: "ANALYTICS", label: "Analytics — read-only metrics" },
];

export default async function AdminsPage() {
  const me = await requireAdminPage("admins.manage");
  const admins = await platformDb().platformAdmin.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } } } });
  return (
    <>
      <PageHeader title="Platform staff" description="People who can use this console. Each role sees only what it needs." />
      <Card>
        <ul className="divide-y divide-ink-100 text-sm">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium">{a.name} <span className="text-ink-500">· {a.email}</span> {!a.isActive && <Badge tone="red">disabled</Badge>}</p>
                <p className="text-xs text-ink-500">{a.role.toLowerCase()} · 2FA {a.totpEnabled ? "on" : "off"} · last sign-in {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : "never"} · {a._count.sessions} active {a._count.sessions === 1 ? "session" : "sessions"}</p>
              </div>
              {a.id !== me.id && (
                <div className="flex flex-wrap gap-2">
                  {a.isActive ? <RunButton label="Disable" variant="ghost" action={updateAdminAction.bind(null, a.id, { isActive: false })} /> : <RunButton label="Enable" action={updateAdminAction.bind(null, a.id, { isActive: true })} />}
                  {a._count.sessions > 0 && <RunButton label="Sign out everywhere" variant="ghost" action={signOutAdminEverywhereAction.bind(null, a.id)} />}
                  {a.totpEnabled && <RunButton label="Reset 2FA" variant="ghost" action={updateAdminAction.bind(null, a.id, { reset2fa: true })} />}
                  {ROLES.filter((r) => r.value !== a.role).map((r) => <RunButton key={r.value} label={`Make ${r.value.toLowerCase()}`} variant="ghost" action={updateAdminAction.bind(null, a.id, { role: r.value as "OWNER" })} />)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Add platform staff" description="A temporary password is shown once. They should change it and turn on two-factor sign-in under My account." />
        <div className="p-5">
          <ActionForm
            submitLabel="Create account"
            reset
            action={createAdminAction}
            fields={[
              { name: "name", label: "Full name" },
              { name: "email", label: "Email" },
              { name: "role", label: "Role", type: "select", options: ROLES, defaultValue: "SUPPORT" },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
