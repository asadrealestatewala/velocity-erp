import { redirect } from "next/navigation";
import { PlatformAuthShell } from "@/components/platform/login-card";
import { TotpSetup } from "@/components/auth/totp-setup";
import { beginTotpAction, confirmTotpAction, disableTotpAction, platformLogoutAction } from "@/server/actions/platform";
import { getAdmin, mustEnrolTwoFactor } from "@/server/platform/admin-auth";

export const metadata = { title: { absolute: "Set up two-factor · Velocity console" }, icons: { icon: "/brand/velocity-app-icon.png" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Outside the console layout on purpose: a signed-in admin who must enrol can reach only this page, so nobody is locked out and nobody skips the policy. */
export default async function EnrolPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/platform/login");
  if (!(await mustEnrolTwoFactor(admin))) redirect("/platform");
  return (
    <PlatformAuthShell title="Set up two-factor sign-in">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">Platform policy requires two-factor sign-in for your role ({admin.role.toLowerCase()}). Set it up now; it takes a minute and you keep your account and password.</p>
        <TotpSetup enabled={false} begin={beginTotpAction} confirm={confirmTotpAction} disable={disableTotpAction} />
        <form action={platformLogoutAction}><button type="submit" className="text-sm text-neutral-500 underline">Sign out</button></form>
      </div>
    </PlatformAuthShell>
  );
}
