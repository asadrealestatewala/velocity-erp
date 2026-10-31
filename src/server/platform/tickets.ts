import "server-only";
import type { SupportTicket, TicketPriority, TicketSource, TicketStatus } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { platformDb } from "./client";
import { sendSystemMail, workspaceUrl } from "./mail";
import { getPlatformSettings } from "./settings";

/** Hours to a first reply, by priority. */
export const SLA_HOURS: Record<TicketPriority, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, LOW: 72 };
export const TICKET_OPEN: TicketStatus[] = ["OPEN", "WAITING_CUSTOMER"];

export type SlaState = "met" | "ok" | "due_soon" | "overdue" | "paused";

/** Where a ticket stands against its first-response deadline. A first reply, or a resolved/closed ticket, stops the clock. */
export function slaState(t: Pick<SupportTicket, "status" | "firstResponseDueAt" | "firstResponseAt">, now = new Date()): SlaState {
  if (t.firstResponseAt) return "met";
  if (t.status === "RESOLVED" || t.status === "CLOSED") return "paused";
  const left = t.firstResponseDueAt.getTime() - now.getTime();
  return left < 0 ? "overdue" : left < 2 * 3_600_000 ? "due_soon" : "ok";
}

const clean = (s: string, max: number) => s.trim().slice(0, max);

export async function createTicket(input: {
  source: TicketSource;
  subject: string;
  body: string;
  tenantId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  priority?: TicketPriority;
  mailThreadKey?: string | null;
  assignee?: { id: string; name: string } | null;
  /** Who wrote the first message: the customer (default) or staff noting a call. */
  firstFrom?: "CUSTOMER" | "NOTE";
}) {
  const subject = clean(input.subject, 160);
  const body = clean(input.body, 10_000);
  if (subject.length < 3) throw new AppError("Give the ticket a short subject.", "VALIDATION", { subject: "At least 3 characters" });
  if (body.length < 3) throw new AppError("Describe the problem.", "VALIDATION", { body: "At least 3 characters" });
  const priority = input.priority ?? "NORMAL";
  return platformDb().supportTicket.create({
    data: {
      source: input.source, subject, tenantId: input.tenantId ?? null, requesterName: input.requesterName ?? null, requesterEmail: input.requesterEmail?.toLowerCase() ?? null,
      priority, mailThreadKey: input.mailThreadKey ?? null, assigneeId: input.assignee?.id ?? null, assigneeName: input.assignee?.name ?? null,
      firstResponseDueAt: new Date(Date.now() + SLA_HOURS[priority] * 3_600_000),
      messages: { create: { kind: input.firstFrom ?? "CUSTOMER", authorName: input.requesterName || input.requesterEmail || "Customer", authorEmail: input.requesterEmail ?? null, body } },
    },
  });
}

/** A staff reply: stops the SLA clock, waits on the customer, and emails the requester (in-app tickets also point to the ticket page). */
export async function staffReply(ticketId: string, admin: { name: string; email: string }, body: string, opts: { internal?: boolean } = {}) {
  const text = clean(body, 10_000);
  if (text.length < 2) throw new AppError("Write a reply first.", "VALIDATION", { body: "Write a reply." });
  const t = await platformDb().supportTicket.findUnique({ where: { id: ticketId }, include: { tenant: true } });
  if (!t) throw new AppError("Ticket not found.", "NOT_FOUND");
  if (opts.internal) {
    await platformDb().ticketMessage.create({ data: { ticketId, kind: "NOTE", authorName: admin.name, authorEmail: admin.email, body: text } });
    await platformDb().supportTicket.update({ where: { id: ticketId }, data: {} }); // bumps updatedAt
    return { emailed: false };
  }
  await platformDb().$transaction([
    platformDb().ticketMessage.create({ data: { ticketId, kind: "STAFF", authorName: admin.name, authorEmail: admin.email, body: text } }),
    platformDb().supportTicket.update({ where: { id: ticketId }, data: { status: "WAITING_CUSTOMER", firstResponseAt: t.firstResponseAt ?? new Date(), resolvedAt: null } }),
  ]);
  let emailed = false;
  if (t.requesterEmail) {
    const link = t.source === "APP" && t.tenant ? `\n\nSee the full conversation: ${workspaceUrl(t.tenant.slug, `/crm/support/${t.id}`)}` : "\n\nJust reply to this email to answer.";
    const res = await sendSystemMail({ to: t.requesterEmail, subject: `Re: [#${t.number}] ${t.subject}`, text: `${text}${link}`, category: "support", tenantId: t.tenantId, sentByEmail: admin.email, threadKey: t.mailThreadKey ?? undefined });
    emailed = res.delivered;
  }
  return { emailed };
}

/** A customer message from the app: reopens a waiting or resolved ticket. */
export async function customerReply(ticketId: string, who: { name: string; email: string }, body: string) {
  const text = clean(body, 10_000);
  if (text.length < 2) throw new AppError("Write a message first.", "VALIDATION", { body: "Write a message." });
  await platformDb().$transaction([
    platformDb().ticketMessage.create({ data: { ticketId, kind: "CUSTOMER", authorName: who.name, authorEmail: who.email, body: text } }),
    platformDb().supportTicket.update({ where: { id: ticketId }, data: { status: "OPEN", resolvedAt: null } }),
  ]);
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  return platformDb().supportTicket.update({ where: { id: ticketId }, data: { status, resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null } });
}

/** Changing priority restarts the first-response deadline from creation time at the new priority (until a reply has been sent). */
export async function setTicketPriority(ticketId: string, priority: TicketPriority) {
  const t = await platformDb().supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
  return platformDb().supportTicket.update({ where: { id: ticketId }, data: { priority, ...(t.firstResponseAt ? {} : { firstResponseDueAt: new Date(t.createdAt.getTime() + SLA_HOURS[priority] * 3_600_000) }) } });
}

export async function assignTicket(ticketId: string, to: { id: string; name: string } | null) {
  return platformDb().supportTicket.update({ where: { id: ticketId }, data: { assigneeId: to?.id ?? null, assigneeName: to?.name ?? null } });
}

/** Tells the operators a customer opened a ticket in the app (best effort). */
export async function notifyNewAppTicket(t: Pick<SupportTicket, "number" | "subject">, workspaceName: string, body: string) {
  const to = (await getPlatformSettings()).support.email.trim();
  if (!to) return;
  await sendSystemMail({ to, subject: `New support ticket #${t.number} from ${workspaceName}: ${t.subject}`, text: `${body.slice(0, 1500)}\n\nOpen it in the console: ${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/platform/support`, category: "support" }).catch(() => {});
}
