import { Suspense } from "react";
import { db } from "@/lib/db";
import { can, requirePortalPage } from "@/server/authz";
import { AppShell } from "@/components/shell/app-shell";
import { PORTAL_NAV } from "@/components/shell/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalPage();
  const unread = await db.notification.count({ where: { userId: user.id, isRead: false } });
  const isManager = user.memberships.some((m) => m.role === "MANAGER");
  const nav = PORTAL_NAV.filter((n) => (!n.perm || can(user, n.perm)) && (!n.managerOnly || isManager));
  return (
    <Suspense>
      <AppShell
        variant="portal"
        nav={nav}
        user={{ name: user.name, email: user.email, roleName: user.roleName }}
        unread={unread}
        subtitle={user.memberships.map((m) => m.dealershipName).join(", ")}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
