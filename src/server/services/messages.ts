import "server-only";
import type { MessageChannel, MessageDirection, MessageStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { dealershipUserIds, notify } from "@/server/services/notifications";
import { ProviderError, WHATSAPP_SERVICE_WINDOW_MS, emailConfigured, sendEmail, sendWhatsAppText, whatsappConfigured } from "@/server/messaging/providers";
import { fullName } from "@/lib/utils";

const activityType = (c: MessageChannel) => (c === "WHATSAPP" ? ("WHATSAPP_LOGGED" as const) : c === "EMAIL" ? ("EMAIL_LOGGED" as const) : ("SMS_LOGGED" as const));
const preview = (s: string) => (s.length > 280 ? `${s.slice(0, 277)}…` : s);

/** The dealership context a conversation belongs to: the contact's current lead's dealership (null = central only). */
export async function conversationDealership(tx: Tx, contactId: string, leadId?: string | null) {
  if (leadId) {
    const l = await tx.lead.findUnique({ where: { id: leadId }, select: { dealershipId: true } });
    return l?.dealershipId ?? null;
  }
  const c = await tx.contact.findUnique({ where: { id: contactId }, select: { currentLead: { select: { dealershipId: true } } } });
  return c?.currentLead?.dealershipId ?? null;
}

/**
 * Sends a message through the real provider. The row is written first (QUEUED) so there is always a record, then
 * updated to SENT only after the provider accepts it, or FAILED with the provider's reason.
 */
export async function sendMessageNow(p: {
  userId: string;
  contactId: string;
  leadId: string | null;
  dealershipId: string | null;
  channel: "WHATSAPP" | "EMAIL";
  body: string;
  subject?: string | null;
}) {
  const contact = await db.contact.findUniqueOrThrow({ where: { id: p.contactId } });
  const prefs = (contact.communicationPrefs ?? {}) as Record<string, boolean>;

  let address: string;
  if (p.channel === "WHATSAPP") {
    if (!whatsappConfigured()) throw new AppError("WhatsApp isn't connected. Log the conversation manually instead.", "VALIDATION");
    if (prefs.whatsapp === false) throw new AppError("This contact has opted out of WhatsApp.", "VALIDATION");
    if (!contact.phoneNormalized) throw new AppError("This contact has no phone number.", "VALIDATION");
    address = contact.phoneNormalized;
    const lastIn = await db.message.findFirst({ where: { contactId: p.contactId, channel: "WHATSAPP", direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!lastIn || Date.now() - lastIn.createdAt.getTime() > WHATSAPP_SERVICE_WINDOW_MS) {
      throw new AppError("WhatsApp only allows free-text messages within 24 hours of the customer's last message. Ask them to message you first, or use “Open WhatsApp” and log the chat.", "VALIDATION");
    }
  } else {
    if (!emailConfigured()) throw new AppError("Email isn't connected. Log the email manually instead.", "VALIDATION");
    if (prefs.email === false) throw new AppError("This contact has opted out of email.", "VALIDATION");
    if (!contact.email) throw new AppError("This contact has no email address.", "VALIDATION");
    if (!p.subject) throw new AppError("Add a subject.", "VALIDATION", { subject: "Required" });
    address = contact.email;
  }

  // Double-click / retry guard: the same sender repeating the same text within seconds is one message.
  const dup = await db.message.findFirst({
    where: { contactId: p.contactId, channel: p.channel, direction: "OUTBOUND", sentById: p.userId, body: p.body, createdAt: { gt: new Date(Date.now() - 15_000) } },
    select: { id: true },
  });
  if (dup) throw new AppError("That message was just sent.", "CONFLICT");

  const row = await db.message.create({
    data: {
      contactId: p.contactId, leadId: p.leadId, dealershipId: p.dealershipId, channel: p.channel, direction: "OUTBOUND", status: "QUEUED",
      subject: p.subject ?? null, body: p.body, address, sentById: p.userId,
    },
  });
  try {
    const out = p.channel === "WHATSAPP" ? await sendWhatsAppText(address, p.body) : await sendEmail({ to: address, subject: p.subject!, body: p.body });
    const sent = await db.$transaction(async (tx) => {
      const m = await tx.message.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), externalId: out.externalId } });
      await logActivity(tx, {
        type: activityType(p.channel), title: p.channel === "WHATSAPP" ? "WhatsApp message sent" : `Email sent: ${p.subject}`, body: preview(p.body),
        contactId: p.contactId, leadId: p.leadId, dealershipId: p.dealershipId, userId: p.userId, direction: "OUTBOUND", outcome: "Sent", metadata: { messageId: row.id },
      });
      return m;
    });
    return { message: sent, ok: true as const };
  } catch (e) {
    const reason = e instanceof ProviderError ? e.message : "The message could not be sent.";
    if (!(e instanceof ProviderError)) console.error("[message send]", e);
    const failed = await db.message.update({ where: { id: row.id }, data: { status: "FAILED", error: reason.slice(0, 500) } });
    return { message: failed, ok: false as const, error: reason };
  }
}

/** Records a conversation that happened outside the system (the integration isn't connected, or a call/WhatsApp from a personal phone). */
export async function logMessage(p: {
  userId: string;
  contactId: string;
  leadId: string | null;
  dealershipId: string | null;
  channel: "WHATSAPP" | "EMAIL";
  direction: MessageDirection;
  body: string;
  subject?: string | null;
  occurredAt?: Date | null;
}) {
  const contact = await db.contact.findUniqueOrThrow({ where: { id: p.contactId }, select: { phone: true, email: true } });
  const at = p.occurredAt && p.occurredAt.getTime() <= Date.now() + 60_000 ? p.occurredAt : new Date();
  return db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        contactId: p.contactId, leadId: p.leadId, dealershipId: p.dealershipId, channel: p.channel, direction: p.direction, status: "LOGGED",
        subject: p.subject ?? null, body: p.body, address: p.channel === "WHATSAPP" ? contact.phone : contact.email, sentById: p.userId,
        sentAt: at, createdAt: at,
      },
    });
    await logActivity(tx, {
      type: activityType(p.channel),
      title: `${p.channel === "WHATSAPP" ? "WhatsApp" : "Email"} ${p.direction === "INBOUND" ? "received" : "sent"} (logged manually)`,
      body: preview(p.body), contactId: p.contactId, leadId: p.leadId, dealershipId: p.dealershipId, userId: p.userId, direction: p.direction,
      outcome: "Logged", metadata: { messageId: m.id }, occurredAt: at,
    });
    return m;
  });
}

/** Store an inbound message that arrived through a provider webhook. Duplicate deliveries (same provider id) are ignored. */
export async function recordInbound(p: {
  channel: "WHATSAPP" | "EMAIL";
  externalId: string;
  contact: { id: string; firstName: string; lastName: string | null };
  body: string;
  subject?: string | null;
  address: string;
  at: Date;
}) {
  return db.$transaction(async (tx) => {
    const exists = await tx.message.findUnique({ where: { channel_externalId: { channel: p.channel, externalId: p.externalId } }, select: { id: true } });
    if (exists) return { duplicate: true as const };
    const contact = await tx.contact.findUniqueOrThrow({ where: { id: p.contact.id }, select: { ownerId: true, currentLeadId: true, currentLead: { select: { id: true, dealershipId: true, assignedUserId: true } } } });
    const lead = contact.currentLead;
    const m = await tx.message.create({
      data: {
        contactId: p.contact.id, leadId: lead?.id ?? null, dealershipId: lead?.dealershipId ?? null, channel: p.channel, direction: "INBOUND", status: "RECEIVED",
        subject: p.subject ?? null, body: p.body, address: p.address, externalId: p.externalId, sentAt: p.at, createdAt: p.at,
      },
    });
    await logActivity(tx, {
      type: activityType(p.channel), title: p.channel === "WHATSAPP" ? "WhatsApp message received" : `Email received: ${p.subject ?? "(no subject)"}`, body: preview(p.body),
      contactId: p.contact.id, leadId: lead?.id ?? null, dealershipId: lead?.dealershipId ?? null, direction: "INBOUND", outcome: "Received", metadata: { messageId: m.id }, occurredAt: p.at,
    });
    const managers = lead?.dealershipId ? await dealershipUserIds(tx, lead.dealershipId, true) : [];
    await notify(tx, {
      userIds: [lead?.assignedUserId ?? "", contact.ownerId ?? "", ...managers].filter(Boolean),
      type: "MESSAGE_RECEIVED",
      title: `New ${p.channel === "WHATSAPP" ? "WhatsApp message" : "email"} from ${fullName(p.contact)}`,
      body: preview(p.body).slice(0, 140),
      link: { central: `/crm/contacts/${p.contact.id}?tab=chat`, portal: `/portal/contacts/${p.contact.id}?tab=chat` },
      entityType: "Contact",
      entityId: p.contact.id,
    });
    return { duplicate: false as const, id: m.id };
  });
}

/** Provider delivery receipts: sent → delivered → read, or failed. Never moves a message backwards. */
export async function applyStatusUpdate(channel: MessageChannel, externalId: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED", at: Date, error?: string) {
  const rank: Record<MessageStatus, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 9, LOGGED: 0, RECEIVED: 0 };
  const m = await db.message.findUnique({ where: { channel_externalId: { channel, externalId } } });
  if (!m || m.direction !== "OUTBOUND") return;
  if (status !== "FAILED" && rank[status] <= rank[m.status]) return;
  await db.message.update({
    where: { id: m.id },
    data: { status, ...(status === "DELIVERED" ? { deliveredAt: at } : {}), ...(status === "READ" ? { readAt: at, deliveredAt: m.deliveredAt ?? at } : {}), ...(status === "FAILED" ? { error: (error ?? "Delivery failed").slice(0, 500) } : {}) },
  });
}
