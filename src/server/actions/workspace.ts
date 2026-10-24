"use server";
import { requireUser } from "@/server/authz";
import { runAction, AppError } from "@/server/errors";
import { newToken, sha256 } from "@/server/platform/crypto";
import { platformDb } from "@/server/platform/client";
import { appBaseUrl, renderMail, sendSystemMail } from "@/server/platform/mail";
import { currentTenant } from "@/server/platform/runtime";
import { invalidateTenant } from "@/server/platform/tenants";
import { platformRateLimit } from "@/server/platform/guard";

/** Owner-side: send the email-confirmation link again (new link, the old one stops working). */
export async function resendConfirmationAction() {
  return runAction(async () => {
    const me = await requireUser("settings.manage");
    const ws = await currentTenant();
    if (ws.emailConfirmedAt) return { ok: true as const, message: "Your email is already confirmed." };
    if (!ws.ownerEmail) throw new AppError("This workspace has no owner email on file.");
    if (!(await platformRateLimit(`confirm:${ws.id}`, 5, 3600))) throw new AppError("Please wait a little before asking for another email.", "RATE_LIMITED");
    const token = newToken();
    await platformDb().tenant.update({ where: { id: ws.id }, data: { confirmTokenHash: sha256(token), confirmExpiresAt: new Date(Date.now() + 3 * 86_400_000) } });
    invalidateTenant(ws.slug);
    const url = `${appBaseUrl()}/confirm-email/${token}`;
    const mail = renderMail({ heading: "Confirm your email address", paragraphs: [`Confirm ${ws.ownerEmail} to finish setting up the ${ws.name} workspace and invite your team.`], cta: { label: "Confirm my email", url }, footer: "This link works once and expires in 3 days." });
    const sent = await sendSystemMail({ to: ws.ownerEmail, subject: "Confirm your email address", text: mail.text, html: mail.html });
    void me;
    return { ok: true as const, message: sent.delivered ? `Confirmation email sent to ${ws.ownerEmail}.` : `Email isn't set up on this server. Open this link to confirm: ${url}` };
  });
}
