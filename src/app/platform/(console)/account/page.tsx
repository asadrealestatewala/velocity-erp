import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm } from "@/components/platform/console";
import { TotpSetup } from "@/components/auth/totp-setup";
import { fmtDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";
import { RunButton } from "@/components/platform/console";
import { describeAgent, listSessions } from "@/server/platform/sessions";
import { beginTotpAction, revokeOtherSessionsAction, revokeSessionAction, changeOwnPasswordAction, confirmTotpAction, disableTotpAction } from "@/server/actions/platform";
import { currentSessionId, requireAdminPage } from "@/server/platform/admin-auth";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireAdminPage();
  const [sessions, here] = await Promise.all([listSessions(me.id), currentSessionId()]);
  return (
    <>
      <PageHeader title="My account" description={`${me.name} · ${me.email} · ${me.role.toLowerCase()}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Change password" />
          <div className="p-5">
            <ActionForm
              submitLabel="Change password"
              reset
              action={changeOwnPasswordAction}
              fields={[
                { name: "current", label: "Current password", type: "password" },
                { name: "next", label: "New password (10+ characters, letters and numbers)", type: "password" },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Two-factor sign-in" description="Strongly recommended for everyone who can see money or suspend a company." />
          <div className="p-5">
            <TotpSetup enabled={me.totpEnabled} begin={beginTotpAction} confirm={confirmTotpAction} disable={disableTotpAction} />
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Signed-in devices" description="Sessions last 8 hours. End any you don't recognise, or sign out everywhere else after using a shared computer." />
        <ul className="divide-y divide-ink-100 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium">{describeAgent(s.userAgent)} {s.id === here && <Badge tone="green">this device</Badge>}</p>
                <p className="text-xs text-ink-500">{s.ipAddress ?? "unknown IP"} · signed in {fmtDateTime(s.createdAt)} · last active {fmtDateTime(s.lastSeenAt ?? s.createdAt)}</p>
              </div>
              {s.id !== here && <RunButton label="Sign out" variant="ghost" action={revokeSessionAction.bind(null, s.id)} />}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && <div className="border-t border-ink-100 p-4"><RunButton label="Sign out other devices" variant="danger" action={revokeOtherSessionsAction} /></div>}
      </Card>
    </>
  );
}
