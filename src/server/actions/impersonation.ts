"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { homePathFor } from "@/lib/home";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { beginViewAs, endViewAs, validateViewAsReason, VIEW_AS_MINUTES } from "@/server/platform/impersonation";
import { runInTenant } from "@/server/platform/runtime";

/** Starts a read-only "view as" of one workspace user. Needs a written reason; recorded in the platform audit log and in the workspace's own audit log. */
export async function startViewAsAction(tenantId: string, input: { userId: string; reason: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("tenants.impersonate");
    const { userId } = z.object({ userId: z.string().min(1) }).parse(input);
    const reason = validateViewAsReason(input.reason);
    const tenant = await platformDb().tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError("Workspace not found.", "NOT_FOUND");
    const user = await runInTenant(tenant.slug, () =>
      db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true, email: true, role: { select: { scope: true, permissions: { select: { permission: { select: { key: true } } } } } } } }),
    );
    if (!user) throw new AppError("That user is not active in this workspace.", "NOT_FOUND");
    const view = await beginViewAs(a, tenant, user, reason);
    await platformAudit({ admin: a, action: "tenant.view_as_started", targetType: "Tenant", targetId: tenant.id, reason, detail: { workspace: tenant.slug, userId: user.id, userEmail: user.email, readOnly: true, minutes: VIEW_AS_MINUTES } });
    // The customer can see it too: their own audit log shows who looked, and why.
    await runInTenant(tenant.slug, () => audit({ userId: null, action: "support.view_as_started", entityType: "User", entityId: user.id, dealershipId: null, changes: { by: a.email, reason, readOnly: true } })).catch(() => {});
    const keys = new Set(user.role.permissions.map((p) => p.permission.key).filter((k): k is PermissionKey => k in PERMISSIONS));
    void view;
    redirect(homePathFor(user.role.scope, keys));
  });
}

/** Leaves the "view as" session (works from any workspace page; the cookie alone identifies it). */
export async function endViewAsAction() {
  const ended = await endViewAs();
  if (ended) {
    await platformAudit({ admin: { id: ended.adminId, email: ended.adminEmail }, action: "tenant.view_as_ended", targetType: "Tenant", targetId: ended.tenantId, detail: { workspace: ended.tenantSlug, userEmail: ended.userEmail } });
  }
  redirect(ended ? `/platform/workspaces/${ended.tenantId}` : "/platform");
}
