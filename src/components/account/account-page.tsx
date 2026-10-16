import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { NOTIFICATION_TYPES, smtpConfigured } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/misc";
import { AccountView } from "./account-view";

export async function AccountPage({ user }: { user: CurrentUser }) {
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
  return (
    <>
      <PageHeader title="Account" description="Your profile, password and notification preferences" />
      <AccountView
        user={{ name: user.name, email: user.email, roleName: user.roleName }}
        types={NOTIFICATION_TYPES}
        prefs={(u.notificationPrefs ?? {}) as Record<string, { inApp: boolean; email: boolean }>}
        mustChange={user.mustChangePassword}
        emailConfigured={smtpConfigured()}
      />
    </>
  );
}