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

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: "Lead created",
  FORM_SUBMITTED: "Form submitted",
  LEAD_ASSIGNED: "Lead assigned",
  LEAD_REASSIGNED: "Lead reassigned",
  CALL_LOGGED: "Phone call",
  EMAIL_LOGGED: "Email",
  WHATSAPP_LOGGED: "WhatsApp",
  SMS_LOGGED: "SMS",
  MEETING_LOGGED: "Meeting",
  NOTE_ADDED: "Note added",
  TASK_CREATED: "Task created",
  TASK_COMPLETED: "Task completed",
  TEST_DRIVE_SCHEDULED: "Test drive scheduled",
  TEST_DRIVE_RESCHEDULED: "Test drive rescheduled",
  TEST_DRIVE_COMPLETED: "Test drive completed",
  TEST_DRIVE_UPDATED: "Test drive updated",
  STAGE_CHANGED: "Stage changed",
  DOCUMENT_UPLOADED: "Document uploaded",
  PAYMENT_RECORDED: "Payment recorded",
  LEAD_CONVERTED: "Lead converted",
  LEAD_LOST: "Lead lost",
  CONTACT_UPDATED: "Contact updated",
  SOURCE_CHANGED: "Source changed",
};
