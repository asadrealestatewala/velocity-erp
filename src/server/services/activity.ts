import "server-only";
import type { ActivityType, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";

export async function logActivity(
  tx: Tx,
  a: {
    type: ActivityType;
    title: string;
    body?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    dealershipId?: string | null;
    userId?: string | null;
    outcome?: string | null;
    direction?: string | null;
    metadata?: Prisma.InputJsonValue;
    occurredAt?: Date;
  },
) {
  const occurredAt = a.occurredAt ?? new Date();
  const act = await tx.activity.create({
    data: {
      type: a.type,
      title: a.title,
      body: a.body ?? null,
      contactId: a.contactId ?? null,
      leadId: a.leadId ?? null,
      dealershipId: a.dealershipId ?? null,
      userId: a.userId ?? null,
      outcome: a.outcome ?? null,
      direction: a.direction ?? null,
      metadata: a.metadata ?? {},
      occurredAt,
    },
  });
  if (a.contactId) await tx.contact.update({ where: { id: a.contactId }, data: { lastActivityAt: occurredAt } });
  if (a.leadId) await tx.lead.update({ where: { id: a.leadId }, data: { lastActivityAt: occurredAt } });
  return act;
}

// Labels live in a client-safe module (the activity timeline UI uses them too).
export { ACTIVITY_LABELS } from "@/lib/activity-labels";
