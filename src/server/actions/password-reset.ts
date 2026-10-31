"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/request";
import { hashIdentifier } from "@/server/rate-limit";
import { newToken, sha256 } from "@/server/platform/crypto";
import { platformRateLimit } from "@/server/platform/guard";
import { workspaceUrl } from "@/server/platform/mail";
import { sendTemplate } from "@/server/platform/mail-send";
import { runInTenant } from "@/server/platform/runtime";
import { DEFAULT_SLUG, getTenant, isValidSlug } from "@/server/platform/tenants";
import { passwordSchema } from "@/lib/password-policy";

export type ForgotState = { done?: boolean; error?: string } | undefined;
const RESET_HOURS = 2;

/**
 * Always answers the same way — whether or not the workspace or account exists — so it can't be used to discover
 * who has an account. If everything matches, a single-use link (valid 2 hours) is emailed.
 */
export async function requestPasswordResetAction(_: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const slug = String(formData.get("workspace") ?? "").trim().toLowerCase() || DEFAULT_SLUG;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid email address." };

  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`forgot:ip:${ip}`, 10, 3600)) || !(await platformRateLimit(`forgot:email:${hashIdentifier(email)}`, 3, 3600))) {
    return { done: true }; // silently throttled: same answer
  }
  const tenant = isValidSlug(slug) ? await getTenant(slug).catch(() => null) : null;
  if (tenant && tenant.status !== "PROVISIONING") {
    await runInTenant(slug, async () => {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.isActive) return;
      const token = newToken();
      await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000) } });
      const url = workspaceUrl(slug, `/reset-password/${token}`);
      await sendTemplate("password-reset", email, { email, workspaceName: tenant.name, resetUrl: url, expiryHours: RESET_HOURS }, { tenantId: tenant.id });
      await audit({ userId: user.id, action: "auth.password_reset_requested", entityType: "User", entityId: user.id });
    }).catch((e) => console.error("[reset] failed", (e as Error).message));
  }
  return { done: true };
}

export type ResetState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Public: sets a new password from a valid single-use link, signs every session out, and sends the person to sign in. */
export async function resetPasswordAction(_: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z.object({ token: z.string().min(20), password: passwordSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) return { error: "This reset link is invalid or has expired. Request a new one." };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12), mustChangePassword: false } });
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
  });
  await audit({ userId: row.userId, action: "auth.password_reset", entityType: "User", entityId: row.userId });
  redirect("/login?reset=1");
}
