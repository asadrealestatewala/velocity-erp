import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm } from "@/components/platform/console";
import { TotpSetup } from "@/components/auth/totp-setup";
import { beginTotpAction, changeOwnPasswordAction, confirmTotpAction, disableTotpAction } from "@/server/actions/platform";
import { requireAdminPage } from "@/server/platform/admin-auth";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireAdminPage();
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
    </>
  );
}
