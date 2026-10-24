"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isSuperAdmin } from "@/server/authz";
import { AppError, runAction } from "@/server/errors";
import { audit } from "@/server/audit";
import { createSession, loadUser } from "@/server/auth/session";
import { newToken, sha256 } from "@/server/platform/crypto";
import { assertWithinPlan } from "@/server/platform/guard";
import { renderMail, sendSystemMail, workspaceUrl } from "@/server/platform/mail";
import { currentTenant } from "@/server/platform/runtime";
import { passwordSchema } from "@/lib/password-policy";
import { homePathFor } from "@/lib/home";

const INVITE_DAYS = 7;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  name: z.string().trim().max(80).optional(),
  roleId: z.string().min(1, "Choose a role"),
});

/** Invite a colleague by email: a one-time link (7 days) lets them choose their own password. */
export async function inviteUserAction(input: z.input<typeof inviteSchema>) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const v = inviteSchema.parse(input);
    const ws = await currentTenant();
    if (!ws.emailConfirmedAt) throw new AppError("Confirm your own email address first (check your inbox for the confirmation link), then you can invite your team.");

    const role = await db.role.findUnique({ where: { id: v.roleId } });
    if (!role || role.scope !== "CENTRAL") throw new AppError("Choose a central-team role. Dealership staff are added from the dealership's Team tab.");
    if (role.key === "SUPER_ADMIN" && !isSuperAdmin(me)) throw new AppError("Only a Super Administrator can invite another Super Administrator.");
    if (await db.user.findUnique({ where: { email: v.email } })) throw new AppError("That email already has an account in this workspace.", "CONFLICT", { email: "Already has an account." });

    // A newer invitation to the same address replaces the older one (and does not count against the seat limit twice).
    await db.userInvitation.updateMany({ where: { email: v.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await assertWithinPlan("maxUsers", 1);

    const token = newToken();
    const inv = await db.userInvitation.create({
      data: { email: v.email, name: v.name || null, roleId: role.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), invitedById: me.id },
    });
    const url = workspaceUrl(ws.slug, `/invite/${token}`);
    const mail = renderMail({
      heading: `${me.name} invited you to ${ws.name}`,
      paragraphs: [`You've been invited to join the ${ws.name} workspace as ${role.name}.`, `Choose your password to get started. The link is valid for ${INVITE_DAYS} days.`],
      cta: { label: "Accept the invitation", url },
      footer: `Workspace code: ${ws.slug}`,
    });
    const sent = await sendSystemMail({ to: v.email, subject: `You're invited to ${ws.name}`, text: mail.text, html: mail.html });
    await audit({ userId: me.id, action: "user.invited", entityType: "UserInvitation", entityId: inv.id, changes: { email: v.email, role: role.key, emailed: sent.delivered } });
    return {
      ok: true as const,
      message: sent.delivered ? `Invitation sent to ${v.email}.` : `Email isn't set up on this server, so nothing was sent. Share this link with ${v.email} yourself: ${url}`,
      data: { link: sent.delivered ? null : url },
    };
  });
}

export async function revokeInvitationAction(id: string) {
  return runAction(async () => {
    const me = await requireUser("users.manage");
    const inv = await db.userInvitation.findUnique({ where: { id } });
    if (!inv || inv.acceptedAt || inv.revokedAt) throw new AppError("That invitation is no longer pending.");
    await db.userInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit({ userId: me.id, action: "user.invitation_revoked", entityType: "UserInvitation", entityId: id, changes: { email: inv.email } });
    return { ok: true as const, message: "Invitation revoked." };
  });
}

export type AcceptState = { error?: string; fieldErrors?: Record<string, string> } | undefined;
const acceptSchema = z.object({ token: z.string().min(20), name: z.string().trim().min(2, "Enter your name").max(80), password: passwordSchema });

/** Public: creates the account from a valid invitation, signs the person in and sends them home. */
export async function acceptInvitationAction(_: AcceptState, formData: FormData): Promise<AcceptState> {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  const { token, name, password } = parsed.data;
  const inv = await db.userInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { role: true } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return { error: "This invitation link is invalid or has expired. Ask your administrator to send a new one." };
  if (await db.user.findUnique({ where: { email: inv.email } })) return { error: "An account with this email already exists. Try signing in instead." };

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: inv.email, name, passwordHash: await bcrypt.hash(password, 12), roleId: inv.roleId } });
    await tx.userInvitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    return u;
  });
  await audit({ userId: user.id, action: "user.invitation_accepted", entityType: "User", entityId: user.id, changes: { role: inv.role.key } });
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const full = await loadUser(user.id);
  redirect(homePathFor(inv.role.scope, full?.permissions ?? new Set()));
}
