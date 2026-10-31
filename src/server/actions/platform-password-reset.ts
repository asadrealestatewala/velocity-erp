"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clientIp } from "@/server/request";
import { hashIdentifier } from "@/server/rate-limit";
import { passwordSchema } from "@/lib/password-policy";
import { platformAudit } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { newToken, sha256 } from "@/server/platform/crypto";
import { platformRateLimit } from "@/server/platform/guard";
import { appBaseUrl, renderMail, sendSystemMail } from "@/server/platform/mail";

export type PlatformForgotState = { done?: boolean; error?: string } | undefined;
export type PlatformResetState = { error?: string; fieldErrors?: Record<string, string> } | undefined;
const RESET_HOURS = 1;

/**
 * Always answers the same way — whether or not the email belongs to an operator — so it can't be used to discover
 * who has an account. A matching, active operator gets a single-use link (valid 1 hour) by email.
 */
export async function requestPlatformPasswordResetAction(_: PlatformForgotState, formData: FormData): Promise<PlatformForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid email address." };

  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`pf-forgot:ip:${ip}`, 10, 3600)) || !(await platformRateLimit(`pf-forgot:email:${hashIdentifier(email)}`, 3, 3600))) {
    return { done: true }; // silently throttled: same answer
  }
  try {
    const admin = await platformDb().platformAdmin.findUnique({ where: { email } });
    if (admin?.isActive) {
      const token = newToken();
      await platformDb().platformPasswordReset.create({ data: { adminId: admin.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000) } });
      const mail = await renderMail({
        heading: "Reset your platform password",
        paragraphs: [`Someone asked to reset the password for ${email} on the Platform console.`, `The link works once and expires in ${RESET_HOURS} hour. Using it signs you out everywhere. Two-factor sign-in, if enabled, still applies afterwards.`],
        cta: { label: "Choose a new password", url: `${appBaseUrl()}/platform/reset-password/${token}` },
        footer: "If you didn't ask for this, you can ignore this email — your password stays the same.",
      });
      await sendSystemMail({ to: email, subject: "Reset your platform password", category: "auth", text: mail.text, html: mail.html });
      await platformAudit({ admin, action: "admin.password_reset_requested" });
    }
  } catch (e) {
    console.error("[platform-reset] failed", (e as Error).message);
  }
  return { done: true };
}

/** Public: sets a new password from a valid single-use link, signs every session out, and sends the operator to sign in. */
export async function resetPlatformPasswordAction(_: PlatformResetState, formData: FormData): Promise<PlatformResetState> {
  const parsed = z.object({ token: z.string().min(20), password: passwordSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`pf-reset:ip:${ip}`, 20, 3600))) return { error: "Too many attempts. Please wait an hour." };
  const db = platformDb();
  const row = await db.platformPasswordReset.findUnique({ where: { tokenHash: sha256(parsed.data.token) }, include: { admin: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.admin.isActive) return { error: "This reset link is invalid or has expired. Request a new one." };
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.$transaction([
    db.platformAdmin.update({ where: { id: row.adminId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
    db.platformPasswordReset.updateMany({ where: { adminId: row.adminId, usedAt: null }, data: { usedAt: new Date() } }),
    db.platformSession.deleteMany({ where: { adminId: row.adminId } }),
  ]);
  await platformAudit({ admin: row.admin, action: "admin.password_reset" });
  redirect("/platform/login?reset=1");
}
