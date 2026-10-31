"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { requireUser } from "@/server/authz";
import { platformDb } from "@/server/platform/client";
import { platformRateLimit } from "@/server/platform/guard";
import { currentTenant } from "@/server/platform/runtime";
import { createTicket, customerReply, notifyNewAppTicket } from "@/server/platform/tickets";

/** A signed-in user of a workspace opens a ticket with the platform's support team. */
export async function openTicketAction(input: { subject: string; body: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const tenant = await currentTenant();
    if (!(await platformRateLimit(`ticket:${tenant.id}:${user.id}`, 10, 3600))) throw new AppError("You've opened a lot of tickets in the last hour. Please wait a while, or add to an existing ticket.", "RATE_LIMITED");
    const v = z.object({ subject: z.string(), body: z.string() }).parse(input);
    const t = await createTicket({ source: "APP", subject: v.subject, body: v.body, tenantId: tenant.isLegacy ? null : tenant.id, requesterName: user.name, requesterEmail: user.email });
    await notifyNewAppTicket(t, tenant.name, v.body);
    redirect(`/crm/support/${t.id}`);
  });
}

/** The customer adds to their own ticket. */
export async function replyToOwnTicketAction(id: string, input: { body: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const tenant = await currentTenant();
    const t = await platformDb().supportTicket.findFirst({ where: { id, source: "APP", requesterEmail: user.email.toLowerCase(), ...(tenant.isLegacy ? {} : { tenantId: tenant.id }) } });
    if (!t) throw new AppError("Ticket not found.", "NOT_FOUND");
    if (t.status === "CLOSED") throw new AppError("This ticket is closed. Please open a new one.");
    await customerReply(t.id, { name: user.name, email: user.email }, input.body);
    return { ok: true as const, message: "Sent." };
  });
}
