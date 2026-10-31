import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentTenant, TENANT_COOKIE } from "@/server/platform/runtime";
import { billingState } from "@/server/platform/billing-state";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { entitlementsCached } from "@/server/platform/plans";
import { currentViewAs } from "@/server/platform/impersonation";

export const SESSION_COOKIE = "yadea_session";
/** Permission groups that belong to the paid "Procurement & dealer operations" module. */
const MODULE_GROUPS = new Set(["Procurement", "Inventory", "Finance"]);

export type Membership = {
  dealershipId: string;
  dealershipName: string;
  dealershipCode: string;
  role: "MANAGER" | "SALES_REP";
  repsSeeAllLeads: boolean;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  scope: "CENTRAL" | "DEALERSHIP";
  permissions: Set<PermissionKey>;
  memberships: Membership[];
  mustChangePassword: boolean;
  /** Set when a platform operator is viewing as this user (read-only). */
  impersonation?: { adminEmail: string; reason: string; expiresAt: Date };
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  const h = await headers();
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Tells later requests which company's database holds this session (the token itself is checked inside that database).
  jar.set(TENANT_COOKIE, (await currentTenant()).slug, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Load a user (with role, permissions and memberships) into the request-scoped shape. */
export async function loadUser(userId: string): Promise<CurrentUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      memberships: {
        where: { isActive: true },
        include: { dealership: { select: { id: true, name: true, code: true, repsSeeAllLeads: true, status: true } } },
      },
    },
  });
  if (!user || !user.isActive) return null;
  let granted = new Set(user.role.permissions.map((rp) => rp.permission.key as PermissionKey));
  const ws = await currentTenant();
  if (!ws.isLegacy && !(await entitlementsCached(ws)).procurement) {
    // The plan does not include Procurement & dealer operations: those permissions simply do not exist for this workspace.
    granted = new Set([...granted].filter((k) => !MODULE_GROUPS.has(PERMISSIONS[k]?.group ?? "")));
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.role.key,
    roleName: user.role.name,
    scope: user.role.scope,
    permissions: granted,
    // Suspended / inactive dealerships lose portal access to their data.
    memberships: user.memberships
      .filter((m) => m.dealership.status === "ACTIVE" || m.dealership.status === "PENDING")
      .map((m) => ({
        dealershipId: m.dealership.id,
        dealershipName: m.dealership.name,
        dealershipCode: m.dealership.code,
        role: m.role,
        repsSeeAllLeads: m.dealership.repsSeeAllLeads,
      })),
    mustChangePassword: user.mustChangePassword,
  };
}

/** Resolve the current user from the session cookie. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // A platform operator's read-only "view as" takes precedence over any normal session in this browser.
  const view = await currentViewAs();
  if (view) {
    const tenant = await currentTenant();
    if (view.tenantId === tenant.id) {
      if (billingState(tenant).blocked) return null;
      const u = await loadUser(view.userId);
      return u ? { ...u, mustChangePassword: false, impersonation: { adminEmail: view.adminEmail, reason: view.reason, expiresAt: view.expiresAt } } : null;
    }
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: hashToken(token) } });
  if (!session) return null;
  if (billingState(await currentTenant()).blocked) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Sliding expiration: extend when less than half the lifetime remains.
  const ttl = env.sessionTtlDays * 24 * 60 * 60 * 1000;
  if (session.expiresAt.getTime() - Date.now() < ttl / 2) {
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + ttl) } }).catch(() => {});
  }
  return loadUser(session.userId);
});
