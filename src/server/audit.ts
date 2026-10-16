import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

export async function audit(
  entry: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    changes?: Prisma.InputJsonValue;
    ipAddress?: string | null;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
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
