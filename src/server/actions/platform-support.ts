"use server";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { assignTicket, createTicket, setTicketPriority, setTicketStatus, staffReply } from "@/server/platform/tickets";

const priority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const status = z.enum(["OPEN", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]);

export async function createTicketAction(input: { subject: string; body: string; priority?: string; tenantCode?: string; requesterEmail?: string; requesterName?: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("support.manage");
    const v = z.object({ subject: z.string(), body: z.string(), priority: priority.default("NORMAL"), tenantCode: z.string().trim().toLowerCase().optional(), requesterEmail: z.string().trim().email().optional().or(z.literal("")), requesterName: z.string().trim().max(80).optional() }).parse({ ...input, priority: input.priority || "NORMAL" });
    const tenant = v.tenantCode ? await platformDb().tenant.findUnique({ where: { slug: v.tenantCode } }) : null;
    if (v.tenantCode && !tenant) throw new AppError(`No workspace with code “${v.tenantCode}”.`, "VALIDATION", { tenantCode: "Unknown workspace" });
    const t = await createTicket({ source: "CONSOLE", subject: v.subject, body: v.body, priority: v.priority, tenantId: tenant?.id, requesterEmail: v.requesterEmail || tenant?.ownerEmail || null, requesterName: v.requesterName || tenant?.ownerName || null, assignee: { id: a.id, name: a.name }, firstFrom: "NOTE" });
    await platformAudit({ admin: a, action: "ticket.created", targetType: "SupportTicket", targetId: t.id, detail: { number: t.number, workspace: tenant?.slug ?? null } });
    return { ok: true as const, message: `Ticket #${t.number} created and assigned to you.` };
  });
}

/** Turns an inbox thread into a ticket (once per thread), linked to the customer's workspace when known. */
export async function ticketFromMailAction(messageId: string) {
  return runAction(async () => {
    const a = await requireAdminAction("support.manage");
    const m = await platformDb().mailMessage.findUnique({ where: { id: messageId } });
    if (!m || m.direction !== "INBOUND") throw new AppError("That message was not found.", "NOT_FOUND");
    const existing = await platformDb().supportTicket.findFirst({ where: { mailThreadKey: m.threadKey } });
    if (existing) throw new AppError(`This thread already has ticket #${existing.number}.`, "CONFLICT");
    const t = await createTicket({ source: "MAIL", subject: m.subject.replace(/^\s*(re|fwd?)\s*:\s*/i, "") || "(no subject)", body: m.bodyText || "(empty message)", tenantId: m.tenantId, requesterName: m.fromName, requesterEmail: m.fromAddress, mailThreadKey: m.threadKey, assignee: { id: a.id, name: a.name } });
    await platformAudit({ admin: a, action: "ticket.created", targetType: "SupportTicket", targetId: t.id, detail: { number: t.number, fromMail: m.id } });
    return { ok: true as const, message: `Ticket #${t.number} created from this thread.` };
  });
}

export async function ticketReplyAction(id: string, input: { body: string; internal?: boolean }) {
  return runAction(async () => {
    const a = await requireAdminAction("support.manage");
    const r = await staffReply(id, a, input.body, { internal: Boolean(input.internal) });
    await platformAudit({ admin: a, action: input.internal ? "ticket.note" : "ticket.reply", targetType: "SupportTicket", targetId: id });
    return { ok: true as const, message: input.internal ? "Note added." : r.emailed ? "Reply sent." : "Reply saved. It was not emailed (no email provider or no requester address); the customer sees it in the app if they opened the ticket there." };
  });
}

export async function updateTicketAction(id: string, patch: { status?: string; priority?: string; assignTo?: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("support.manage");
    if (patch.status) await setTicketStatus(id, status.parse(patch.status));
    if (patch.priority) await setTicketPriority(id, priority.parse(patch.priority));
    if (patch.assignTo !== undefined) {
      const to = patch.assignTo ? await platformDb().platformAdmin.findFirst({ where: { id: patch.assignTo, isActive: true } }) : null;
      if (patch.assignTo && !to) throw new AppError("That person is not an active member of staff.");
      await assignTicket(id, to ? { id: to.id, name: to.name } : null);
    }
    await platformAudit({ admin: a, action: "ticket.updated", targetType: "SupportTicket", targetId: id, detail: patch });
    return { ok: true as const, message: "Saved." };
  });
}
