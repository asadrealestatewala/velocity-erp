import "server-only";
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
export async function changeOwnerEmail(tenantId: string, rawEmail: string): Promise<{ slug: string; from: string; to: string }> {
  const to = rawEmail.trim().toLowerCase();
  const db = platformDb();
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw new AppError("Workspace not found.", "NOT_FOUND");
  if (t.isLegacy) throw new AppError("The default workspace's owner is managed from its own Users page.");
  if (t.dataPurgedAt || !t.ownerEmail) throw new AppError("This workspace has no owner on file.");
  const from = t.ownerEmail.toLowerCase();
  if (from === to) throw new AppError("That is already the owner's email.", "VALIDATION", { email: "Same as the current email" });

  await runInTenant(t.slug, async () => {
    const owner = await tenantDb.user.findUnique({ where: { email: from } });
    if (!owner) throw new AppError("The owner's login was not found in the company database.");
    if (await tenantDb.user.findUnique({ where: { email: to } })) throw new AppError("Another user in this workspace already uses that email.", "CONFLICT", { email: "Already in use" });
    await tenantDb.$transaction([
      tenantDb.user.update({ where: { id: owner.id }, data: { email: to } }),
      tenantDb.session.deleteMany({ where: { userId: owner.id } }),
    ]);
  });
  try {
    await db.tenant.update({ where: { id: tenantId }, data: { ownerEmail: to, ownerEmailHash: emailHash(to), emailConfirmedAt: null } });
  } catch (e) {
    // Keep both sides consistent: put the owner's login back.
    await runInTenant(t.slug, () => tenantDb.user.updateMany({ where: { email: to }, data: { email: from } })).catch(() => {});
    throw e;
  }
  return { slug: t.slug, from, to };
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
