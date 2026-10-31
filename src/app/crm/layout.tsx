import { Suspense } from "react";
import { ViewAsBanner } from "@/components/shell/view-as-banner";
import { db } from "@/lib/db";
import { requireCentralPage, can, leadScope } from "@/server/authz";
import { AppShell, type QuickAction } from "@/components/shell/app-shell";
import { CRM_NAV } from "@/components/shell/nav";
import { assistantConfigFor } from "@/server/assistant/config";
import { workspaceChrome } from "@/server/platform/chrome";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCentralPage();
  const canAssign = can(user, "leads.assign");
  const [unread, unassigned] = await Promise.all([
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    canAssign ? db.lead.count({ where: { AND: [leadScope(user), { dealershipId: null, isArchived: false, stage: { kind: "OPEN" } }] } }) : Promise.resolve(0),
  ]);
  const chrome = await workspaceChrome(can(user, "settings.manage"));
  const nav = CRM_NAV.filter((n) => (!n.perm || can(user, n.perm)) && (n.href !== "/crm/billing" || chrome.workspaceName));
  const actions: QuickAction[] = [];
  if (can(user, "contacts.create")) actions.push({ label: "New contact", href: "/crm/contacts/new", variant: "primary", icon: "plus" });
  if (canAssign) actions.push({ label: "Assign leads", href: "/crm/contacts?assigned=no", variant: "outline", icon: "share", badge: unassigned });
  return (
    <Suspense>
      <ViewAsBanner view={user.impersonation} />
      <AppShell variant="crm" nav={nav} user={{ name: user.name, email: user.email, roleName: user.roleName }} unread={unread} actions={actions} assistant={chrome.assistantAllowed ? assistantConfigFor(user) : null} banner={chrome.banner} workspaceName={chrome.workspaceName}>
        {children}
      </AppShell>
    </Suspense>
  );
}
