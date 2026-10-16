import "server-only";
import type { InquiryType, LeadOrigin, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { AppError } from "@/server/errors";
import { logActivity } from "./activity";
import { award } from "./gamification";
import { dealershipUserIds, notify } from "./notifications";

export async function defaultStage(tx: Tx) {
  const s =
    (await tx.leadStage.findFirst({ where: { isDefault: true, isActive: true } })) ??
    (await tx.leadStage.findFirst({ where: { isActive: true, kind: "OPEN" }, orderBy: { sortOrder: "asc" } }));
  if (!s) throw new AppError("No active pipeline stage is configured.");
  return s;
}

export type CreateLeadInput = {
  contactId: string;
  origin: LeadOrigin;
  originDealershipId?: string | null;
  inquiryType: InquiryType;
  inquiryCategory?: string | null;
  description?: string | null;
  sourceId?: string | null;
  cityId?: string | null;
  interestedModelId?: string | null;
  preferredDealershipId?: string | null;
  campaign?: string | null;
  referralDetails?: string | null;
  utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  externalId?: string | null;
  sourceFormId?: string | null;
  createdById?: string | null;
  ownerId?: string | null;
  nextFollowUpAt?: Date | null;
  customFields?: Prisma.InputJsonValue;
};

export async function createLead(tx: Tx, input: CreateLeadInput) {
  const stage = await defaultStage(tx);
  const lead = await tx.lead.create({
    data: {
      contactId: input.contactId,
      stageId: stage.id,
      origin: input.origin,
      originDealershipId: input.originDealershipId ?? null,
      inquiryType: input.inquiryType,
      inquiryCategory: input.inquiryCategory ?? null,
      description: input.description ?? null,
      sourceId: input.sourceId ?? null,
      originalSourceId: input.sourceId ?? null,
      cityId: input.cityId ?? null,
      interestedModelId: input.interestedModelId ?? null,
      preferredDealershipId: input.preferredDealershipId ?? null,
      campaign: input.campaign ?? null,
      referralDetails: input.referralDetails ?? null,
      utmSource: input.utm?.source ?? null,
      utmMedium: input.utm?.medium ?? null,
      utmCampaign: input.utm?.campaign ?? null,
      utmTerm: input.utm?.term ?? null,
      utmContent: input.utm?.content ?? null,
      externalId: input.externalId ?? null,
      sourceFormId: input.sourceFormId ?? null,
      createdById: input.createdById ?? null,
      ownerId: input.ownerId ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      customFields: input.customFields ?? {},
      lastActivityAt: new Date(),
    },
  });
  await tx.leadStageHistory.create({
    data: { leadId: lead.id, toStageId: stage.id, changedById: input.createdById ?? null, note: "Lead created" },
  });
  await tx.contact.update({ where: { id: input.contactId }, data: { currentLeadId: lead.id } });
  await logActivity(tx, {
    type: "LEAD_CREATED",
    title: input.origin === "DEALERSHIP_WALK_IN" ? "Walk-in lead created" : `Lead #${lead.number} created`,
    body: input.description ?? null,
    contactId: input.contactId,
    leadId: lead.id,
    dealershipId: input.originDealershipId ?? null,
    userId: input.createdById ?? null,
    metadata: { inquiryType: input.inquiryType, origin: input.origin },
  });
  return lead;
}

export type StageChangeInput = {
  leadId: string;
  stageId: string;
  userId: string | null;
  actingDealershipId?: string | null;
  lossReasonId?: string | null;
  lossNotes?: string | null;
  conversionValue?: number | null;
  soldModelId?: string | null;
  conversionNotes?: string | null;
  note?: string | null;
};

/** Move a lead to a stage, enforcing loss-reason rules and recording full history. */
export async function changeStage(tx: Tx, input: StageChangeInput) {
  const lead = await tx.lead.findUnique({
    where: { id: input.leadId },
    include: { stage: true, contact: { select: { firstName: true, lastName: true } } },
  });
  if (!lead) throw new AppError("Lead not found.", "NOT_FOUND");
  const to = await tx.leadStage.findUnique({ where: { id: input.stageId } });
  if (!to || !to.isActive) throw new AppError("That stage is not available.");
  if (to.id === lead.stageId) return lead;

  const data: Prisma.LeadUpdateInput = { stage: { connect: { id: to.id } }, stageChangedAt: new Date() };

  if (to.kind === "LOST") {
    if (!input.lossReasonId) throw new AppError("A loss reason is required.", "VALIDATION", { lossReasonId: "Select a loss reason" });
    const reason = await tx.lossReason.findFirst({ where: { id: input.lossReasonId, isActive: true } });
    if (!reason) throw new AppError("Invalid loss reason.");
    data.lossReason = { connect: { id: reason.id } };
    data.lossNotes = input.lossNotes ?? null;
    data.lostAt = new Date();
  } else {
    if (lead.lossReasonId) data.lossReason = { disconnect: true };
    data.lostAt = null;
  }

  if (to.kind === "WON") {
    data.convertedAt = lead.convertedAt ?? new Date();
    if (input.conversionValue != null) data.conversionValue = input.conversionValue;
    if (input.soldModelId) data.soldModel = { connect: { id: input.soldModelId } };
    if (input.conversionNotes) data.conversionNotes = input.conversionNotes;
  } else if (lead.stage.kind === "WON") {
    // Re-opened: it is no longer a conversion.
    data.convertedAt = null;
  }

  const updated = await tx.lead.update({ where: { id: lead.id }, data });
  await tx.leadStageHistory.create({
    data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: to.id, changedById: input.userId, note: input.note ?? null },
  });

  if (to.kind === "WON") {
    // The contact becomes a customer — same record, no duplicate.
    await tx.contact.update({ where: { id: lead.contactId }, data: { type: "CUSTOMER" } });
  }

  const name = [lead.contact.firstName, lead.contact.lastName].filter(Boolean).join(" ");
  await logActivity(tx, {
    type: to.kind === "WON" ? "LEAD_CONVERTED" : to.kind === "LOST" ? "LEAD_LOST" : "STAGE_CHANGED",
    title: `${lead.stage.name} → ${to.name}`,
    body: to.kind === "LOST" ? (input.lossNotes ?? null) : to.kind === "WON" ? (input.conversionNotes ?? null) : (input.note ?? null),
    contactId: lead.contactId,
    leadId: lead.id,
    dealershipId: lead.dealershipId,
    userId: input.userId,
    metadata: { from: lead.stage.key, to: to.key, lossReasonId: input.lossReasonId ?? null },
  });

  if (input.userId) {
    if (to.kind === "OPEN" && to.sortOrder > lead.stage.sortOrder) {
      await award(tx, { userId: input.userId, dealershipId: lead.dealershipId, type: "STAGE_ADVANCED", uniqueKey: `stage:${lead.id}:${to.id}`, leadId: lead.id });
    }
    if (to.kind === "WON") {
      await award(tx, { userId: lead.assignedUserId ?? input.userId, dealershipId: lead.dealershipId, type: "LEAD_CONVERTED", uniqueKey: `convert:${lead.id}`, leadId: lead.id });
    }
  }

  if (to.notifyOnEnter) {
    const recipients = new Set<string>();
    if (lead.dealershipId) (await dealershipUserIds(tx, lead.dealershipId, true)).forEach((u) => recipients.add(u));
    if (lead.assignedUserId) recipients.add(lead.assignedUserId);
    if (lead.ownerId) recipients.add(lead.ownerId);
    if (input.userId) recipients.delete(input.userId);
    await notify(tx, {
      userIds: [...recipients],
      type: "STAGE_ENTERED",
      title: `${name} moved to ${to.name}`,
      body: `Lead #${lead.number}`,
      link: { central: `/crm/contacts/${lead.contactId}`, portal: `/portal/contacts/${lead.contactId}` },
      entityType: "Lead",
      entityId: lead.id,
    });
  }
  return updated;
}

/** Advance automatically (e.g. when a test drive is booked) but never move a lead backwards or out of WON/LOST. */
export async function advanceToStageKey(tx: Tx, leadId: string, stageKey: string, userId: string | null) {
  const [lead, target] = await Promise.all([
    tx.lead.findUnique({ where: { id: leadId }, include: { stage: true } }),
    tx.leadStage.findUnique({ where: { key: stageKey } }),
  ]);
  if (!lead || !target || !target.isActive) return;
  if (lead.stage.kind !== "OPEN" || lead.stage.sortOrder >= target.sortOrder) return;
  await changeStage(tx, { leadId, stageId: target.id, userId, note: "Updated automatically" });
}

const CONTACT_ACTIVITIES = new Set(["CALL_LOGGED", "EMAIL_LOGGED", "WHATSAPP_LOGGED", "SMS_LOGGED", "MEETING_LOGGED"]);

/** Record an outbound/inbound interaction and award first-contact points (once per lead). */
export async function recordInteraction(
  tx: Tx,
  input: {
    leadId: string | null;
    contactId: string;
    type: "CALL_LOGGED" | "EMAIL_LOGGED" | "WHATSAPP_LOGGED" | "SMS_LOGGED" | "MEETING_LOGGED";
    title: string;
    body?: string | null;
    outcome?: string | null;
    direction?: string | null;
    userId: string;
    dealershipId: string | null;
  },
) {
  const act = await logActivity(tx, { ...input });
  if (input.leadId && CONTACT_ACTIVITIES.has(input.type)) {
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    if (lead) {
      const now = new Date();
      await tx.lead.update({
        where: { id: lead.id },
        data: { lastContactedAt: now, firstContactedAt: lead.firstContactedAt ?? now },
      });
      if (!lead.firstContactedAt && input.direction !== "INBOUND") {
        await award(tx, { userId: input.userId, dealershipId: lead.dealershipId, type: "FIRST_CONTACT", uniqueKey: `first-contact:${lead.id}`, leadId: lead.id });
        const row = await tx.setting.findUnique({ where: { key: "system" } });
        const windowH = (row?.value as { gamification?: { responseWindowHours?: number } } | null)?.gamification?.responseWindowHours ?? 2;
        const from = lead.assignedAt ?? lead.createdAt;
        if (now.getTime() - from.getTime() <= windowH * 3600_000) {
          await award(tx, { userId: input.userId, dealershipId: lead.dealershipId, type: "FAST_RESPONSE_BONUS", uniqueKey: `fast:${lead.id}`, leadId: lead.id });
        }
      }
    }
  }
  return act;
}
