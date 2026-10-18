import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

/**
 * Records a sensitive action. Each entry is tagged with the dealership it belongs to so dealerships can
 * read their own audit log (and only their own):
 *  - pass `dealershipId` explicitly when YADEA staff act on a dealership's data (null = central-only entry);
 *  - otherwise it is inferred: an action on a Dealership record belongs to that dealership, and an action
 *    by a dealership user belongs to that user's dealership.
 */
export async function audit(
  entry: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    dealershipId?: string | null;
    changes?: Prisma.InputJsonValue;
    ipAddress?: string | null;
  },
  tx: Tx = db,
) {
  let dealershipId = entry.dealershipId;
  if (dealershipId === undefined) {
    if (entry.entityType === "Dealership" && entry.entityId) {
      dealershipId = entry.entityId;
    } else if (entry.userId) {
      const m = await tx.dealershipMembership.findFirst({
        where: { userId: entry.userId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { dealershipId: true },
      });
      dealershipId = m?.dealershipId ?? null;
    } else {
      dealershipId = null;
    }
  }
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      dealershipId,
      changes: entry.changes ?? {},
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/** Shallow diff of two plain objects for audit trails. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out as Prisma.InputJsonValue;
}
