import { Suspense } from "react";
import { ViewAsBanner } from "@/components/shell/view-as-banner";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PROCUREMENT_ENTRY_PERMISSIONS, can, requireProcurementPage } from "@/server/authz";
import { homePathFor } from "@/lib/home";
import { AppShell } from "@/components/shell/app-shell";
import { PROCUREMENT_NAV } from "@/components/shell/nav";
import { assistantConfigFor } from "@/server/assistant/config";
import { workspaceChrome } from "@/server/platform/chrome";

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireProcurementPage();
  // Central staff without any procurement/accounts permission belong in the CRM, not here.
  if (!PROCUREMENT_ENTRY_PERMISSIONS.some((p) => can(user, p))) redirect(homePathFor(user.scope, user.permissions));
  const unread = await db.notification.count({ where: { userId: user.id, isRead: false } });
  const chrome = await workspaceChrome(can(user, "settings.manage"));
  const nav = PROCUREMENT_NAV.filter((n) => !n.perm || can(user, n.perm));
  return (
    <Suspense>
      <ViewAsBanner view={user.impersonation} />
      <AppShell
        variant="procurement"
        nav={nav}
        user={{ name: user.name, email: user.email, roleName: user.roleName }}
        unread={unread}
        subtitle={user.roleName}
        assistant={chrome.assistantAllowed ? assistantConfigFor(user) : null}
        banner={chrome.banner} announcements={chrome.announcements}
        workspaceName={chrome.workspaceName}
        actions={can(user, "dashboard.view") ? [{ label: "Open CRM", href: "/crm/dashboard", variant: "outline", icon: "share" }] : []}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
