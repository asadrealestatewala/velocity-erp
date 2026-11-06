import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { AppError } from "@/server/errors";
import { db as tenantDb } from "@/lib/db";
import { platformDb } from "./client";
import { emailHash, newToken, sha256 } from "./crypto";
import { appBaseUrl } from "./mail";
import { sendTemplate } from "./mail-send";
import { runInTenant } from "./runtime";

/**
 * Changes the owner's email in both places that hold it: the platform workspace record and the owner's login in the
 * company's own database. The tenant change runs first so a clash leaves the platform record untouched.
 */
export async function changeOwnerEmail(tenantId: string, rawEmail: string): Promise<{ slug: string; from: string; to: string; tempPassword?: string; repaired?: "relinked" | "created" }> {
  const to = rawEmail.trim().toLowerCase();
  const db = platformDb();
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw new AppError("Workspace not found.", "NOT_FOUND");
  if (t.isLegacy) throw new AppError("The default workspace's owner is managed from its own Users page.");
  if (t.dataPurgedAt || !t.ownerEmail) throw new AppError("This workspace has no owner on file.");
  const from = t.ownerEmail.toLowerCase();
  if (from === to) throw new AppError("That is already the owner's email.", "VALIDATION", { email: "Same as the current email" });

  let tempPassword: string | undefined;
  let repaired: "relinked" | "created" | undefined;
  await runInTenant(t.slug, async () => {
    if (await tenantDb.user.findUnique({ where: { email: to } })) throw new AppError("Another user in this workspace already uses that email.", "CONFLICT", { email: "Already in use" });
    // The owner's login normally has the platform record's email. If it was edited or never created, fall back to the
    // workspace's oldest administrator, and as a last resort create the owner so the company is never locked out.
    let owner = await tenantDb.user.findUnique({ where: { email: from } });
    if (owner) {
      await tenantDb.$transaction([tenantDb.user.update({ where: { id: owner.id }, data: { email: to } }), tenantDb.session.deleteMany({ where: { userId: owner.id } })]);
      return;
    }
    owner = await tenantDb.user.findFirst({ where: { role: { key: "SUPER_ADMIN" } }, orderBy: { createdAt: "asc" } });
    if (owner) {
      await tenantDb.$transaction([tenantDb.user.update({ where: { id: owner.id }, data: { email: to, isActive: true } }), tenantDb.session.deleteMany({ where: { userId: owner.id } })]);
      repaired = "relinked";
      return;
    }
    const role = await tenantDb.role.findUnique({ where: { key: "SUPER_ADMIN" } });
    if (!role) throw new AppError("This workspace has no administrator role, so its owner login cannot be created. Contact engineering.");
    tempPassword = `Yd-${randomBytes(6).toString("base64url")}-${randomInt(10, 99)}`;
    await tenantDb.user.create({ data: { email: to, name: t.ownerName?.trim() || "Owner", passwordHash: await bcrypt.hash(tempPassword, 12), roleId: role.id, mustChangePassword: true } });
    repaired = "created";
  });
  try {
    await db.tenant.update({ where: { id: tenantId }, data: { ownerEmail: to, ownerEmailHash: emailHash(to), emailConfirmedAt: null } });
  } catch (e) {
    // Keep both sides consistent: put the owner's login back (a newly created one is removed).
    await runInTenant(t.slug, () => repaired === "created" ? tenantDb.user.deleteMany({ where: { email: to } }) : tenantDb.user.updateMany({ where: { email: to }, data: { email: from } })).catch(() => {});
    throw e;
  }
  return { slug: t.slug, from, to, tempPassword, repaired };
}

/** Issues a new one-time confirmation link for the owner's current email and mails it. */
export async function sendOwnerConfirmation(tenantId: string, sentByEmail: string): Promise<{ delivered: boolean; url: string }> {
  const db = platformDb();
  const token = newToken();
  const t = await db.tenant.update({ where: { id: tenantId }, data: { confirmTokenHash: sha256(token), confirmExpiresAt: new Date(Date.now() + 3 * 86_400_000) } });
  if (!t.ownerEmail) throw new AppError("This workspace has no owner email on file.");
  const url = `${appBaseUrl()}/confirm-email/${token}`;
  const sent = await sendTemplate("confirm-email", t.ownerEmail, { name: (t.ownerName ?? "there").split(" ")[0], workspaceName: t.name, workspaceCode: t.slug, confirmUrl: url, trialLine: "" }, { tenantId, sentByEmail });
  return { delivered: !!sent.delivered, url };
}

/** Sets the owner's password directly (no email). Signs the owner out everywhere; optionally forces a change at next sign-in. */
export async function setOwnerPassword(tenantId: string, password: string, mustChange: boolean): Promise<{ slug: string; email: string }> {
  const t = await platformDb().tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw new AppError("Workspace not found.", "NOT_FOUND");
  if (t.isLegacy) throw new AppError("The default workspace's owner is managed from its own Users page.");
  if (t.dataPurgedAt || !t.ownerEmail) throw new AppError("This workspace has no owner on file.");
  const email = t.ownerEmail.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  await runInTenant(t.slug, async () => {
    const owner = (await tenantDb.user.findUnique({ where: { email } })) ?? (await tenantDb.user.findFirst({ where: { role: { key: "SUPER_ADMIN" } }, orderBy: { createdAt: "asc" } }));
    if (!owner) throw new AppError("This workspace has no owner login. Use \"Change owner email\" to create one.");
    await tenantDb.$transaction([
      tenantDb.user.update({ where: { id: owner.id }, data: { passwordHash, mustChangePassword: mustChange, isActive: true } }),
      tenantDb.session.deleteMany({ where: { userId: owner.id } }),
      tenantDb.passwordResetToken.deleteMany({ where: { userId: owner.id } }),
    ]);
  });
  return { slug: t.slug, email };
}
