import Link from "next/link";
import { db } from "@/lib/db";
import { isSuperAdmin, requireCentralPage } from "@/server/authz";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";
import { NewDepartment, PermissionMatrix, ResetPasswordButton, ResetTwoFactorButton, UserDialog } from "./user-controls";
import { InviteDialog, RevokeInviteButton } from "./invite-controls";
import { currentTenant } from "@/server/platform/runtime";

export const metadata = { title: "Users & permissions" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireCentralPage("users.manage");
  const tab = (await searchParams).tab === "roles" ? "roles" : "users";
  const ws = await currentTenant();
  const pendingInvites = await db.userInvitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { role: true } });
  const [users, roles, departments, permissions] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: { scope: "asc" } }, { name: "asc" }],
      include: { role: true, department: true, memberships: { where: { isActive: true }, include: { dealership: { select: { id: true, name: true } } } } },
    }),
    db.role.findMany({ orderBy: [{ scope: "asc" }, { createdAt: "asc" }], include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.permission.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] }),
  ]);
  const central = roles.filter((r) => r.scope === "CENTRAL" && (r.key !== "SUPER_ADMIN" || isSuperAdmin(me)));
  return (
    <>
      <PageHeader
        title="Users & permissions"
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Users & permissions" }]}
        actions={
          tab === "users" ? (
            <>
              <InviteDialog roles={central} canInvite={!!ws.emailConfirmedAt} blockedReason={ws.emailConfirmedAt ? undefined : "Confirm your own email address first (see the link we emailed you)."} />
              <UserDialog roles={central} departments={departments} />
            </>
          ) : undefined
        }
      />
      <div className="mb-4 flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm sm:w-fit">
        <Link href="/crm/users" className={`rounded-md px-4 py-1.5 ${tab === "users" ? "bg-ink-900 text-white" : "text-ink-600"}`}>Users ({users.length})</Link>
        <Link href="/crm/users?tab=roles" className={`rounded-md px-4 py-1.5 ${tab === "roles" ? "bg-ink-900 text-white" : "text-ink-600"}`}>Roles & permissions</Link>
      </div>
      {tab === "users" ? (
        <>
          <TableWrap>
            <thead className="bg-ink-50/60"><tr><th className="th">User</th><th className="th">Role</th><th className="th">Department</th><th className="th">Dealerships</th><th className="th">Status</th><th className="th">Last sign-in</th><th className="th sr-only">Actions</th></tr></thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-ink-50/50">
                  <td className="td"><p className="font-medium text-ink-900">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-brand-600">(you)</span>}</p><p className="text-xs text-ink-500">{u.email}</p></td>
                  <td className="td"><Badge tone={u.role.scope === "CENTRAL" ? "dark" : "brand"}>{u.role.name}</Badge></td>
                  <td className="td">{u.department?.name ?? "—"}</td>
                  <td className="td">{u.memberships.map((m) => <Link key={m.id} href={`/crm/dealerships/${m.dealership.id}`} className="link mr-2 text-xs">{m.dealership.name}</Link>)}{!u.memberships.length && <span className="text-ink-400">—</span>}</td>
                  <td className="td">{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}{u.mustChangePassword && <Badge tone="amber" className="ml-1">Temp password</Badge>}</td>
                  <td className="td text-xs whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="td text-right whitespace-nowrap">
                    {u.role.scope === "CENTRAL" && (u.role.key !== "SUPER_ADMIN" || isSuperAdmin(me)) && (
                      <>
                        <UserDialog user={{ id: u.id, name: u.name, email: u.email, phone: u.phone, roleId: u.roleId, departmentId: u.departmentId, isActive: u.isActive }} roles={central} departments={departments} isSelf={u.id === me.id} />
                        {u.id !== me.id && <ResetPasswordButton id={u.id} name={u.name} />}
                        {u.id !== me.id && u.totpEnabled && <ResetTwoFactorButton id={u.id} name={u.name} />}
                      </>
                    )}
                    {u.role.scope === "DEALERSHIP" && u.memberships[0] && <Link href={`/crm/dealerships/${u.memberships[0].dealership.id}`} className="text-xs text-brand-600 hover:underline">Manage via team →</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {pendingInvites.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="Pending invitations" description="Links stay valid for 7 days. A newer invitation to the same address replaces the older one." />
              <ul className="divide-y divide-ink-100">
                {pendingInvites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">{i.email}</p>
                      <p className="text-xs text-ink-500">{i.role.name} · expires {fmtDateTime(i.expiresAt)}</p>
                    </div>
                    <Badge tone="amber">Invited</Badge>
                    <RevokeInviteButton id={i.id} email={i.email} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="mt-4 max-w-lg">
            <CardHeader title="Departments" description={departments.map((d) => d.name).join(" · ") || "None"} />
            <div className="p-4"><NewDepartment /></div>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader title="Role permissions" description="You can't edit your own role, the Super Administrator role is fixed, and you can only grant permissions you hold." />
          <PermissionMatrix
            roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, scope: r.scope, perms: r.permissions.map((p) => p.permission.key) }))}
            permissions={permissions}
            myRoleKey={me.roleKey}
            isSuper={isSuperAdmin(me)}
            myPerms={[...me.permissions]}
          />
        </Card>
      )}
    </>
  );
}
