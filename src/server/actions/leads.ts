"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { interactionSchema, leadDetailsSchema, stageChangeSchema } from "@/lib/validation";
import { can, contextDealershipId, isCentral, requireUser } from "@/server/authz";
import { accessibleContact, accessibleLead, assertAssignable, assertDealershipManager } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, forbidden, runAction } from "@/server/errors";
import { changeStage, recordInteraction } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";

export async function changeStageAction(input: z.input<typeof stageChangeSchema>) {
  return runAction(async () => {
    const user = await requireUser("leads.change_stage");
    const v = stageChangeSchema.parse(input);
    const lead = await accessibleLead(user, v.leadId);
    if (!isCentral(user) && lead.isArchived) throw forbidden();
    await db.$transaction((tx) =>
      changeStage(tx, {
        leadId: lead.id, stageId: v.stageId, userId: user.id, lossReasonId: v.lossReasonId, lossNotes: v.lossNotes,
        conversionValue: v.conversionValue ?? null, soldModelId: v.soldModelId, conversionNotes: v.conversionNotes, note: v.note,
      }),
    );
    await audit({ userId: user.id, action: "lead.stage_changed", entityType: "Lead", entityId: lead.id, changes: { stageId: { from: lead.stageId, to: v.stageId } } });
    return { ok: true as const, message: "Stage updated." };
  });
}

const assignSchema = z.object({
  leadId: z.string().min(1),
  dealershipId: z.string().nullable(),
  userId: z.string().nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Central staff (leads.assign) can move a lead to any eligible dealership.
 * Dealership managers (leads.assign_team) can only change the representative within their own dealership.
 */
export async function assignLeadAction(input: z.input<typeof assignSchema>) {
  return runAction(async () => {
    const user = await requireUser();
    const v = assignSchema.parse(input);
    const lead = await accessibleLead(user, v.leadId);

    if (isCentral(user)) {
      if (!can(user, "leads.assign")) throw forbidden();
    } else {
      if (!can(user, "leads.assign_team")) throw forbidden();
      assertDealershipManager(user, lead.dealershipId);
      if (v.dealershipId !== lead.dealershipId) throw forbidden("Dealership users cannot move leads to another dealership.");
    }
    await db.$transaction((tx) =>
      assignLead(tx, {
        leadId: lead.id,
        dealershipId: v.dealershipId,
        userId: v.userId === undefined ? undefined : v.userId,
        type: "MANUAL",
        reason: v.reason || (isCentral(user) ? "Manual assignment by YADEA staff" : "Assigned by dealership manager"),
        assignedById: user.id,
      }),
    );
    await audit({ userId: user.id, action: "lead.assigned", entityType: "Lead", entityId: lead.id, changes: { dealershipId: { from: lead.dealershipId, to: v.dealershipId }, userId: { from: lead.assignedUserId, to: v.userId ?? null } } });
    return { ok: true as const, message: v.dealershipId ? "Lead assigned." : "Lead returned to the unassigned queue." };
  });
}

/** Bulk-assign from the unassigned queue (central only). */
export async function bulkAssignAction(input: { leadIds: string[]; dealershipId: string; reason?: string }) {
  return runAction(async () => {
    const user = await requireUser("leads.assign");
    if (!isCentral(user)) throw forbidden();
    const ids = z.array(z.string()).min(1).max(200).parse(input.leadIds);
    let n = 0;
    for (const id of ids) {
      await accessibleLead(user, id);
      await db.$transaction((tx) => assignLead(tx, { leadId: id, dealershipId: input.dealershipId, type: "MANUAL", reason: input.reason || "Bulk assignment", assignedById: user.id }));
      n++;
    }
    await audit({ userId: user.id, action: "lead.bulk_assigned", entityType: "Lead", changes: { count: n, dealershipId: input.dealershipId } });
    return { ok: true as const, message: `${n} lead(s) assigned.` };
  });
}

export async function logInteractionAction(contactId: string, input: z.input<typeof interactionSchema>) {
  return runAction(async () => {
    const user = await requireUser("notes.manage");
    await accessibleContact(user, contactId);
    const v = interactionSchema.parse(input);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    const labels = { CALL_LOGGED: "Phone call", EMAIL_LOGGED: "Email", WHATSAPP_LOGGED: "WhatsApp message", SMS_LOGGED: "SMS", MEETING_LOGGED: "Meeting" } as const;
    await db.$transaction((tx) =>
      recordInteraction(tx, {
        leadId: lead?.id ?? null, contactId, type: v.type,
        title: `${labels[v.type]} (${v.direction === "INBOUND" ? "inbound" : "outbound"})${v.outcome ? ` · ${v.outcome}` : ""}`,
        body: v.body, outcome: v.outcome, direction: v.direction, userId: user.id,
        dealershipId: contextDealershipId(user, lead?.dealershipId),
      }),
    );
    return { ok: true as const, message: "Interaction logged." };
  });
}

const followUpSchema = z.object({
  leadId: z.string().min(1),
  dueAt: z.coerce.date(),
  title: z.string().trim().max(160).optional(),
  assignedToId: z.string().optional(),
  type: z.enum(["CALL", "FOLLOW_UP", "EMAIL", "MEETING", "OTHER"]).default("FOLLOW_UP"),
});

/** Schedule a follow-up: creates a task and sets the lead's next follow-up date. */
export async function scheduleFollowUpAction(input: z.input<typeof followUpSchema>) {
  return runAction(async () => {
    const user = await requireUser("tasks.manage");
    const v = followUpSchema.parse(input);
    const lead = await accessibleLead(user, v.leadId);
    if (v.dueAt.getTime() < Date.now() - 60_000) throw new AppError("Choose a time in the future.", "VALIDATION", { dueAt: "Must be in the future" });
    const assignee = v.assignedToId || lead.assignedUserId || user.id;
    await assertAssignable(user, assignee, lead.dealershipId);
    const contact = await db.contact.findUniqueOrThrow({ where: { id: lead.contactId }, select: { firstName: true, lastName: true } });
    await db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: v.title || `Follow up with ${contact.firstName}`, type: v.type, contactId: lead.contactId, leadId: lead.id,
          dealershipId: contextDealershipId(user, lead.dealershipId), assignedToId: assignee, createdById: user.id, dueAt: v.dueAt,
          priority: "MEDIUM", reminderMinutesBefore: 60,
        },
      });
      await tx.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: v.dueAt } });
      await logActivity(tx, { type: "TASK_CREATED", title: `Follow-up scheduled: ${task.title}`, body: v.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }), contactId: lead.contactId, leadId: lead.id, dealershipId: task.dealershipId, userId: user.id });
      if (assignee !== user.id) {
        await notify(tx, { userIds: [assignee], type: "TASK_ASSIGNED", title: `Follow-up assigned: ${task.title}`, body: `Due ${v.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, link: { central: `/crm/contacts/${lead.contactId}?tab=tasks`, portal: `/portal/contacts/${lead.contactId}?tab=tasks` }, entityType: "Task", entityId: task.id });
      }
    });
    return { ok: true as const, message: "Follow-up scheduled." };
  });
}

/** Create an additional lead (new inquiry) on an existing contact. */
export async function addLeadToContactAction(contactId: string, input: z.input<typeof leadDetailsSchema> & { sourceId?: string | null }) {
  return runAction(async () => {
    const user = await requireUser("contacts.create");
    const contact = await accessibleContact(user, contactId);
    const v = leadDetailsSchema.parse(input);
    const central = isCentral(user);
    const dealershipId = central ? null : user.memberships[0]!.dealershipId;
    const { createLead } = await import("@/server/services/leads");
    const lead = await db.$transaction(async (tx) => {
      const l = await createLead(tx, {
        contactId, origin: central ? "COMPANY" : "DEALERSHIP_WALK_IN", originDealershipId: dealershipId,
        inquiryType: central ? v.inquiryType : "WALK_IN", inquiryCategory: v.inquiryCategory, description: v.description,
        sourceId: input.sourceId ?? contact.sourceId, cityId: contact.cityId, interestedModelId: v.interestedModelId,
        preferredDealershipId: v.preferredDealershipId, campaign: v.campaign, nextFollowUpAt: v.nextFollowUpAt,
        createdById: user.id, ownerId: central ? user.id : null,
      });
      if (dealershipId) {
        await tx.lead.update({ where: { id: l.id }, data: { dealershipId, assignedAt: new Date(), assignedUserId: user.memberships[0]!.role === "SALES_REP" ? user.id : null } });
        await tx.leadAssignmentHistory.create({ data: { leadId: l.id, toDealershipId: dealershipId, toUserId: user.memberships[0]!.role === "SALES_REP" ? user.id : null, type: "MANUAL", reason: "Dealership walk-in lead", assignedById: user.id } });
      }
      return l;
    });
    return { ok: true as const, data: { leadId: lead.id }, message: `Lead #${lead.number} created.` };
  });
}
