import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { PlatformAdmin, PlatformRole } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { verifyTotp } from "@/lib/totp";
import { platformDb } from "./client";
import { decryptSecret, newToken, sha256 } from "./crypto";
export { ensureFirstAdmin } from "./admin-bootstrap";

export const ADMIN_COOKIE = "yadea_platform";
const SESSION_HOURS = 8;

/** What each platform role may do. OWNER can do everything; the others are deliberately narrow. */
export const ROLE_PERMS = {
  OWNER: ["dashboard", "reports", "tenants.view", "tenants.manage", "trials.manage", "payments.manage", "refunds.manage", "plans.manage", "coupons.manage", "settings.manage", "campaigns.send", "admins.manage", "audit.view", "system.manage", "mail.manage", "mail.settings"],
  BILLING: ["dashboard", "reports", "tenants.view", "payments.manage", "refunds.manage", "coupons.manage", "audit.view", "mail.manage"],
  SUPPORT: ["dashboard", "tenants.view", "tenants.manage", "trials.manage", "audit.view", "mail.manage"],
  ANALYTICS: ["dashboard", "reports", "tenants.view"],
} as const satisfies Record<PlatformRole, readonly string[]>;
export type PlatformPerm = (typeof ROLE_PERMS)["OWNER"][number];
export const adminCan = (role: PlatformRole, perm: PlatformPerm) => (ROLE_PERMS[role] as readonly string[]).includes(perm);

export async function platformAudit(entry: { admin?: Pick<PlatformAdmin, "id" | "email"> | null; action: string; targetType?: string; targetId?: string; reason?: string; detail?: object }) {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    ua = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    /* no request scope (scripts, tests) */
  }
  await platformDb().platformAudit.create({
    data: { adminId: entry.admin?.id ?? null, adminEmail: entry.admin?.email ?? null, action: entry.action, targetType: entry.targetType ?? null, targetId: entry.targetId ?? null, reason: entry.reason ?? null, detail: (entry.detail ?? {}) as object, ipAddress: ip, userAgent: ua },
  });
}

export async function startAdminSession(adminId: string) {
  const token = newToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await platformDb().platformSession.create({ data: { id: sha256(token), adminId, expiresAt, ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null } });
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/platform", expires: expiresAt });
}

export async function endAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await platformDb().platformSession.deleteMany({ where: { id: sha256(token) } });
  jar.delete({ name: ADMIN_COOKIE, path: "/platform" });
}

/** The signed-in platform admin (or null). */
export const getAdmin = cache(async (): Promise<PlatformAdmin | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const s = await platformDb().platformSession.findUnique({ where: { id: sha256(token) }, include: { admin: true } });
  if (!s || s.expiresAt < new Date() || !s.admin.isActive) return null;
  return s.admin;
});

/** For pages: redirects to sign-in, or back to the dashboard when the role lacks the permission. */
export async function requireAdminPage(perm?: PlatformPerm): Promise<PlatformAdmin> {
  const a = await getAdmin();
  if (!a) redirect("/platform/login");
  if (perm && !adminCan(a.role, perm)) redirect("/platform?denied=1");
  return a;
}

/** For server actions: throws instead of redirecting. */
export async function requireAdminAction(perm: PlatformPerm): Promise<PlatformAdmin> {
  const a = await getAdmin();
  if (!a) throw new AppError("Your session has expired. Please sign in again.", "UNAUTHENTICATED");
  if (!adminCan(a.role, perm)) throw new AppError("Your platform role does not allow this action.", "FORBIDDEN");
  return a;
}

/** Checks an authenticator code or a one-time recovery code (consumed on use). */
export async function checkSecondFactor(admin: PlatformAdmin, code: string): Promise<boolean> {
  const clean = code.trim();
  if (!clean) return false;
  if (admin.totpSecretEnc) {
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), clean);
    // A code is accepted once: its time step must be newer than the last one used (no replay within the 90-second window).
    if (step !== null && step > admin.lastTotpStep) {
      await platformDb().platformAdmin.update({ where: { id: admin.id }, data: { lastTotpStep: step } });
      return true;
    }
  }
  const hashes = (admin.recoveryCodes as string[]) ?? [];
  const h = sha256(`recovery:${clean.toLowerCase()}`);
  if (hashes.includes(h)) {
    await platformDb().platformAdmin.update({ where: { id: admin.id }, data: { recoveryCodes: hashes.filter((x) => x !== h) } });
    return true;
  }
  return false;
}
