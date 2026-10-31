import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { PlatformAdmin } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { adminCan } from "./admin-auth";
import { platformDb } from "./client";
import { newToken, sha256 } from "./crypto";
import { TENANT_COOKIE, VIEW_AS_COOKIE } from "./runtime";

export const VIEW_AS_MINUTES = 30;

export type ViewAs = { id: string; adminId: string; adminEmail: string; tenantId: string; tenantSlug: string; userId: string; userName: string; userEmail: string; reason: string; expiresAt: Date };

/** Opens a read-only "view as" session and sets the cookie. The caller has already checked the permission and written the audit entry. */
export async function beginViewAs(admin: Pick<PlatformAdmin, "id" | "email">, tenant: { id: string; slug: string }, user: { id: string; name: string; email: string }, reason: string): Promise<ViewAs> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + VIEW_AS_MINUTES * 60_000);
  const row = await platformDb().platformImpersonation.create({
    data: { id: sha256(token), adminId: admin.id, adminEmail: admin.email, tenantId: tenant.id, tenantSlug: tenant.slug, userId: user.id, userName: user.name, userEmail: user.email, reason, expiresAt },
  });
  const jar = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt };
  jar.set(VIEW_AS_COOKIE, token, opts);
  jar.set(TENANT_COOKIE, tenant.slug, { ...opts, expires: undefined, maxAge: 60 * 60 * 24 * 365 });
  return row;
}

/** The live "view as" session behind this request's cookie, or null (missing, expired, ended, or the operator lost access). */
export const currentViewAs = cache(async (): Promise<ViewAs | null> => {
  let token: string | undefined;
  try {
    token = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;
  const row = await platformDb().platformImpersonation.findUnique({ where: { id: sha256(token) } });
  if (!row || row.endedAt || row.expiresAt < new Date()) return null;
  const admin = await platformDb().platformAdmin.findUnique({ where: { id: row.adminId }, select: { isActive: true, role: true } });
  if (!admin?.isActive || !adminCan(admin.role, "tenants.impersonate")) return null;
  return row;
});

/** Ends the current session (if any) and clears the cookie. Returns what was ended so the caller can audit it. */
export async function endViewAs(): Promise<ViewAs | null> {
  const jar = await cookies();
  const token = jar.get(VIEW_AS_COOKIE)?.value;
  jar.delete({ name: VIEW_AS_COOKIE, path: "/" });
  if (!token) return null;
  const row = await platformDb().platformImpersonation.findUnique({ where: { id: sha256(token) } });
  if (!row) return null;
  if (!row.endedAt) await platformDb().platformImpersonation.update({ where: { id: row.id }, data: { endedAt: new Date() } });
  return row;
}

export function validateViewAsReason(reason: unknown): string {
  const r = String(reason ?? "").trim();
  if (r.length < 10) throw new AppError("Describe why you need to view this workspace (at least 10 characters, e.g. the ticket or what the customer reported).", "VALIDATION", { reason: "At least 10 characters" });
  return r.slice(0, 300);
}
