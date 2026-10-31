import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformDb } from "./client";
import { sha256 } from "./crypto";
import { sendTemplate } from "./mail-send";
import { workspaceUrl } from "./mail";
import { invalidateTenant } from "./tenants";

/** Marks the owner's email as confirmed if the one-time link is valid. Returns the workspace, or null for a bad/used/expired link. */
export async function confirmWorkspaceEmail(token: string): Promise<Tenant | null> {
  const db = platformDb();
  const tenant = await db.tenant.findFirst({ where: { confirmTokenHash: sha256(token), confirmExpiresAt: { gt: new Date() } } });
  if (!tenant) return null;
  const updated = await db.tenant.update({ where: { id: tenant.id }, data: { emailConfirmedAt: new Date(), confirmTokenHash: null, confirmExpiresAt: null } });
  invalidateTenant(tenant.slug);
  if (updated.ownerEmail) {
    // The welcome email must never undo or delay the confirmation itself.
    await sendTemplate("welcome", updated.ownerEmail, { name: (updated.ownerName ?? "there").split(" ")[0], workspaceName: updated.name, workspaceCode: updated.slug, loginUrl: workspaceUrl(updated.slug, "/login") }, { tenantId: updated.id }).catch((e) => console.error("[welcome mail]", (e as Error).message));
  }
  return updated;
}
