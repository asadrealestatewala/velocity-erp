import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireCentralPage, can } from "@/server/authz";
import { AppShell } from "@/components/shell/app-shell";
import { CRM_NAV } from "@/components/shell/nav";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCentralPage();
  const unread = await db.notification.count({ where: { userId: user.id, isRead: false } });
  const nav = CRM_NAV.filter((n) => !n.perm || can(user, n.perm));
  return (
    <Suspense>
      <AppShell variant="crm" nav={nav} user={{ name: user.name, email: user.email, roleName: user.roleName }} unread={unread}>
        {children}
      </AppShell>
    </Suspense>
  );
}
