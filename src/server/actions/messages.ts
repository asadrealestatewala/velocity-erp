"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { childScope, contextDealershipId, requireUser } from "@/server/authz";
import { accessibleContact, accessibleLead } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, runAction } from "@/server/errors";
import { logMessage, sendMessageNow } from "@/server/services/messages";
import { loggedMessageSchema, messageSchema } from "@/lib/validation-ops";

export type ChatMessage = {
  id: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  subject: string | null;
  body: string;
  error: string | null;
  at: string;
  by: string | null;
};

async function context(user: Awaited<ReturnType<typeof requireUser>>, contactId: string, leadId?: string | null) {
  await accessibleContact(user, contactId);
  const lead = leadId ? await accessibleLead(user, leadId) : null;
  if (lead && lead.contactId !== contactId) throw new AppError("That lead doesn't belong to this contact.");
  return { lead, dealershipId: contextDealershipId(user, lead?.dealershipId ?? (await currentLeadDealership(contactId))) };
}
async function currentLeadDealership(contactId: string) {
  const c = await db.contact.findUnique({ where: { id: contactId }, select: { currentLead: { select: { dealershipId: true } } } });
  return c?.currentLead?.dealershipId ?? null;
}

/** Send a WhatsApp or email message through the connected provider. */
export async function sendMessageAction(input: z.input<typeof messageSchema>) {
  return runAction(async () => {
    const user = await requireUser("messages.send");
    const v = messageSchema.parse(input);
    const { lead, dealershipId } = await context(user, v.contactId, v.leadId);
    const out = await sendMessageNow({ userId: user.id, contactId: v.contactId, leadId: lead?.id ?? null, dealershipId, channel: v.channel, body: v.body, subject: v.subject });
    await audit({ userId: user.id, dealershipId, action: out.ok ? "message.sent" : "message.send_failed", entityType: "Contact", entityId: v.contactId, changes: { channel: v.channel, status: out.message.status } });
    if (!out.ok) throw new AppError(out.error);
    return { ok: true as const, message: v.channel === "WHATSAPP" ? "WhatsApp message sent." : "Email sent." };
  });
}

/** Record a WhatsApp/email conversation that happened outside the system. Clearly marked as logged — never as sent by the CRM. */
export async function logMessageAction(input: z.input<typeof loggedMessageSchema>) {
  return runAction(async () => {
    const user = await requireUser("messages.send");
    const v = loggedMessageSchema.parse(input);
    const { lead, dealershipId } = await context(user, v.contactId, v.leadId);
    if (v.channel === "EMAIL" && !v.subject) throw new AppError("Add the email's subject.", "VALIDATION", { subject: "Required" });
    await logMessage({ userId: user.id, contactId: v.contactId, leadId: lead?.id ?? null, dealershipId, channel: v.channel, direction: v.direction, body: v.body, subject: v.subject, occurredAt: v.occurredAt });
    await audit({ userId: user.id, dealershipId, action: "message.logged", entityType: "Contact", entityId: v.contactId, changes: { channel: v.channel, direction: v.direction } });
    return { ok: true as const, message: "Conversation logged." };
  });
}

export async function listMessagesAction(contactId: string) {
  return runAction(async (): Promise<ChatMessage[]> => {
    const user = await requireUser("messages.send");
    await accessibleContact(user, contactId);
    const rows = await db.message.findMany({
      where: { contactId, ...childScope(user) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 300,
      include: { sentBy: { select: { name: true } } },
    });
    return rows.map((m) => ({
      id: m.id, channel: m.channel, direction: m.direction, status: m.status, subject: m.subject, body: m.body, error: m.error, at: (m.sentAt ?? m.createdAt).toISOString(), by: m.sentBy?.name ?? null,
    }));
  });
}
