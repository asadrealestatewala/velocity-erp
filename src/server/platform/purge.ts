import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformAudit } from "./admin-auth";
import { platformDb } from "./client";
import { deleteWorkspaceFiles } from "./export";
import { dropSchema } from "./migrate";
import { invalidateTenant } from "./tenants";

/** Why a workspace may not be scheduled for deletion, or null when it may. */
export function deletionBlocker(t: Pick<Tenant, "isLegacy" | "status" | "dataPurgedAt">): string | null {
  if (t.isLegacy) return "The original (default) workspace can't be deleted from the console.";
  if (t.dataPurgedAt) return "This workspace's data has already been deleted.";
  if (t.status === "ACTIVE" || t.status === "PROVISIONING") return "Suspend or cancel the workspace first. An active workspace can't be scheduled for deletion.";
  return null;
}

/**
 * Erases the data of every workspace whose retention window has ended: uploaded files, then the whole schema. The tenant row and its
 * invoices and payments stay (accounting records); personal fields on the row are cleared. Returns the slugs erased.
 */
export async function purgeDueWorkspaces(now = new Date()): Promise<string[]> {
  const due = await platformDb().tenant.findMany({ where: { isLegacy: false, dataPurgedAt: null, deletionScheduledFor: { lte: now }, status: { in: ["SUSPENDED", "CANCELLED"] } } });
  const done: string[] = [];
  for (const t of due) {
    try {
      const files = await deleteWorkspaceFiles(t).catch(() => 0);
      // A workspace on its own database connection belongs to the customer's infrastructure: we never drop schemas there.
      const dropped = !t.dbUrlEnc;
      if (dropped) await dropSchema(t.dbSchema);
      await platformDb().tenant.update({ where: { id: t.id }, data: { dataPurgedAt: now, status: "CANCELLED", ownerName: null, ownerEmail: null, ownerEmailHash: null, notes: null, confirmTokenHash: null, deletionScheduledFor: null } });
      invalidateTenant(t.slug);
      await platformAudit({ admin: null, action: "tenant.data_purged", targetType: "Tenant", targetId: t.id, detail: { slug: t.slug, filesDeleted: files, schemaDropped: dropped, ownConnection: Boolean(t.dbUrlEnc) } });
      done.push(t.slug);
    } catch (e) {
      console.error(`[purge] ${t.slug} failed`, e);
    }
  }
  return done;
}
