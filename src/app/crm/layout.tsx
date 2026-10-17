import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireCentralPage, can, leadScope } from "@/server/authz";
import { AppShell, type QuickAction } from "@/components/shell/app-shell";
import { CRM_NAV } from "@/components/shell/nav";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCentralPage();
  const canAssign = can(user, "leads.assign");
  const [unread, unassigned] = await Promise.all([
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    canAssign ? db.lead.count({ where: { AND: [leadScope(user), { dealershipId: null, isArchived: false, stage: { kind: "OPEN" } }] } }) : Promise.resolve(0),
  ]);
  const nav = CRM_NAV.filter((n) => !n.perm || can(user, n.perm));
  const actions: QuickAction[] = [];
  if (can(user, "contacts.create")) actions.push({ label: "New contact", href: "/crm/contacts/new", variant: "primary", icon: "plus" });
  if (canAssign) actions.push({ label: "Assign leads", href: "/crm/contacts?assigned=no", variant: "outline", icon: "share", badge: unassigned });
  return (
    <Suspense>
      <AppShell variant="crm" nav={nav} user={{ name: user.name, email: user.email, roleName: user.roleName }} unread={unread} actions={actions}>
        {children}
      </AppShell>
    </Suspense>
  );
}
