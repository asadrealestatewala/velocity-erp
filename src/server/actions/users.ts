"use server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/server/auth/session";
import { isSuperAdmin, requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, forbidden, notFound, runAction } from "@/server/errors";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { assertWithinPlan } from "@/server/platform/guard";
import { userPhoneFields } from "@/server/user-phone";

const tempPassword = () => `Yd-${randomBytes(6).toString("base64url")}-${Math.floor(10 + Math.random() * 89)}`;

const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional().nullable(),
  roleId: z.string().min(1),
  departmentId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

/** Central user management. Dealership accounts are managed from the dealership's Team panel. */
export async function saveUserAction(id: string | null, input: z.input<typeof userSchema>) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const v = userSchema.parse(input);
    const role = await db.role.findUnique({ where: { id: v.roleId } });
    if (!role) throw new AppError("Choose a role.");
    if (role.scope !== "CENTRAL") throw new AppError("Dealership roles are assigned from the dealership's Team panel.");
    if (role.key === "SUPER_ADMIN" && !isSuperAdmin(me)) throw forbidden("Only a Super Administrator can grant Super Administrator access.");
    const clash = await db.user.findFirst({ where: { email: v.email, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That email is already in use.", "CONFLICT", { email: "Already in use" });

    if (id) {
      const before = await db.user.findUnique({ where: { id }, include: { role: true } });
      if (!before) throw notFound();
      if (before.role.scope !== "CENTRAL") throw new AppError("Manage dealership accounts from the dealership's Team panel.");
      if (id === me.id && (v.roleId !== before.roleId || !v.isActive)) throw forbidden("You can't change your own role or deactivate yourself.");
      if (before.role.key === "SUPER_ADMIN" && !isSuperAdmin(me)) throw forbidden("Only a Super Administrator can modify a Super Administrator.");
      if (v.isActive && !before.isActive) await assertWithinPlan("maxUsers", 1);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { ...v, ...(await userPhoneFields(v.phone, { excludeUserId: id, tx })), departmentId: v.departmentId || null } });
        if (!v.isActive) await tx.session.deleteMany({ where: { userId: id } });
        await audit({ userId: me.id, action: "user.updated", entityType: "User", entityId: id, changes: { role: { from: before.role.key, to: role.key }, isActive: { from: before.isActive, to: v.isActive } } }, tx);
      });
      return { ok: true as const, data: { tempPassword: null as string | null }, message: "User saved." };
    }
    await assertWithinPlan("maxUsers", 1);
    const pw = tempPassword();
    const u = await db.user.create({ data: { ...v, ...(await userPhoneFields(v.phone)), departmentId: v.departmentId || null, passwordHash: await hashPassword(pw), mustChangePassword: true } });
    await audit({ userId: me.id, action: "user.created", entityType: "User", entityId: u.id, changes: { role: role.key } });
    return { ok: true as const, data: { tempPassword: pw as string | null }, message: "User created." };
  });
}

export async function resetUserPasswordAction(id: string) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const u = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw notFound();
    if (id === me.id) throw forbidden("Use Account to change your own password.");
    if (u.role.key === "SUPER_ADMIN" && !isSuperAdmin(me)) throw forbidden();
    const pw = tempPassword();
    await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true } });
    await db.session.deleteMany({ where: { userId: id } });
    await audit({ userId: me.id, action: "user.password_reset", entityType: "User", entityId: id });
    return { ok: true as const, data: { tempPassword: pw }, message: "Temporary password generated." };
  });
}

/**
 * Edit a role's permission grants. Guards against privilege escalation:
 * nobody edits the role they hold, the Super Administrator role is immutable,
 * and non-super-admins can only grant permissions they hold themselves.
 */
export async function setRolePermissionsAction(roleId: string, keys: string[]) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const role = await db.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound();
    if (role.key === "SUPER_ADMIN") throw forbidden("The Super Administrator role always has every permission.");
    if (role.key === me.roleKey) throw forbidden("You can't change the permissions of your own role.");
    const wanted = z.array(z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]])).parse(keys);
    if (!isSuperAdmin(me)) {
      const beyond = wanted.filter((k) => !me.permissions.has(k));
      if (beyond.length) throw forbidden(`You can't grant permissions you don't hold: ${beyond.join(", ")}`);
    }
    if (role.scope === "DEALERSHIP" && wanted.some((k) => k === "leads.view_all" || k === "users.manage" || k === "settings.manage" || k === "leads.assign")) {
      throw new AppError("Dealership roles can't receive organisation-wide permissions.");
    }
    const perms = await db.permission.findMany({ where: { key: { in: wanted } } });
    const before = await db.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
    });
    await audit({ userId: me.id, action: "role.permissions_changed", entityType: "Role", entityId: roleId, changes: { from: before.map((b) => b.permission.key), to: wanted } });
    return { ok: true as const, message: `Permissions for ${role.name} saved.` };
  });
}

export async function createDepartmentAction(name: string) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const n = z.string().trim().min(2).max(80).parse(name);
    if (await db.department.findUnique({ where: { name: n } })) throw new AppError("That department exists.");
    await db.department.create({ data: { name: n } });
    await audit({ userId: me.id, action: "department.created", entityType: "Department", changes: { name: n } });
    return { ok: true as const, message: "Department created." };
  });
}
