import "server-only";
import type { AssignmentType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { AppError } from "@/server/errors";
import { logActivity } from "./activity";
import { dealershipUserIds, notify } from "./notifications";

/** An outlet can receive leads only when active AND lead assignment has been activated. */
export async function assertDealershipEligible(tx: Tx, dealershipId: string) {
  const d = await tx.dealership.findUnique({ where: { id: dealershipId } });
  if (!d) throw new AppError("Dealership not found.", "NOT_FOUND");
  if (d.status !== "ACTIVE" || !d.acceptsLeads) {
    throw new AppError(`${d.name} is not currently accepting leads.`, "CONFLICT");
  }
  return d;
}

/**
 * Validate a public test-drive selection: the outlet must belong to the city, be active,
 * accept leads, and (when given) be configured for the bike model.
 */
export async function validateOutletSelection(
  tx: Tx,
  { cityId, dealershipId, bikeModelId }: { cityId: string; dealershipId: string; bikeModelId?: string | null },
) {
  const d = await tx.dealership.findFirst({
    where: { id: dealershipId, cityId, status: "ACTIVE", acceptsLeads: true, city: { isActive: true } },
    include: { bikeModels: { select: { bikeModelId: true } } },
  });
  if (!d) {
    return { ok: false as const, error: "The selected outlet is no longer available in this city. Please choose another outlet." };
  }
  if (bikeModelId && !d.bikeModels.some((m) => m.bikeModelId === bikeModelId)) {
    return { ok: false as const, error: "The selected outlet does not offer test drives for this model. Please choose another model or outlet." };
  }
  return { ok: true as const, dealership: d };
}

/**
 * City-based routing: picks the eligible outlet in the city with the fewest open leads,
 * so volume is balanced. Returns null (never an unrelated dealership) if none qualifies.
 */
export async function pickDealershipForCity(tx: Tx, cityId: string, bikeModelId?: string | null) {
  const candidates = await tx.dealership.findMany({
    where: {
      cityId,
      status: "ACTIVE",
      acceptsLeads: true,
      ...(bikeModelId ? { bikeModels: { some: { bikeModelId } } } : {}),
    },
    select: { id: true, _count: { select: { leads: { where: { stage: { kind: "OPEN" }, isArchived: false } } } } },
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a._count.leads - b._count.leads || a.id.localeCompare(b.id));
  return candidates[0]!.id;
}

export type AssignInput = {
  leadId: string;
  dealershipId: string | null;
  userId?: string | null;
  type: AssignmentType;
  reason?: string | null;
  assignedById?: string | null;
  /** When provided, a second call with the same key is a no-op (idempotent processing). */
  idempotencyKey?: string | null;
  /** Skip the eligibility check — only for clearing an assignment (dealershipId null). */
};

/**
 * The single entry point for every lead (re)assignment. Records history, activity and
 * notifications. Never called implicitly by dealership profile edits.
 */
export async function assignLead(tx: Tx, input: AssignInput) {
  if (input.idempotencyKey) {
    const prior = await tx.leadAssignmentHistory.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) return { changed: false, history: prior };
  }

  const lead = await tx.lead.findUnique({
    where: { id: input.leadId },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!lead) throw new AppError("Lead not found.", "NOT_FOUND");

  const newDealershipId = input.dealershipId;
  let newUserId = input.userId ?? null;

  let dealershipName: string | null = null;
  if (newDealershipId) {
    const d = await assertDealershipEligible(tx, newDealershipId);
    dealershipName = d.name;
    if (newUserId) {
      const m = await tx.dealershipMembership.findFirst({
        where: { userId: newUserId, dealershipId: newDealershipId, isActive: true, user: { isActive: true } },
      });
      if (!m) throw new AppError("The selected representative is not an active member of that dealership.");
    }
  } else if (newUserId) {
    const u = await tx.user.findFirst({ where: { id: newUserId, isActive: true, role: { scope: "CENTRAL" } } });
    if (!u) throw new AppError("Unassigned leads can only be owned by central staff.");
  }

  // userId omitted: keep the current rep within the same dealership; moving dealership drops them.
  if (input.userId === undefined) newUserId = newDealershipId === lead.dealershipId ? lead.assignedUserId : null;

  if (newDealershipId === lead.dealershipId && newUserId === lead.assignedUserId) {
    return { changed: false, history: null };
  }

  const dealershipChanged = newDealershipId !== lead.dealershipId;
  const isReassign = !!lead.dealershipId && dealershipChanged;

  await tx.lead.update({
    where: { id: lead.id },
    data: { dealershipId: newDealershipId, assignedUserId: newUserId, assignedAt: new Date() },
  });

  // Open tasks that belonged to the previous dealership no longer have an owner who can see the lead.
  if (dealershipChanged && lead.dealershipId) {
    await tx.task.updateMany({
      where: { leadId: lead.id, dealershipId: lead.dealershipId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "CANCELLED" },
    });
  }

  const history = await tx.leadAssignmentHistory.create({
    data: {
      leadId: lead.id,
      fromDealershipId: lead.dealershipId,
      toDealershipId: newDealershipId,
      fromUserId: lead.assignedUserId,
      toUserId: newUserId,
      type: input.type,
      reason: input.reason ?? null,
      assignedById: input.assignedById ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  const name = [lead.contact.firstName, lead.contact.lastName].filter(Boolean).join(" ");
  const repName = newUserId ? (await tx.user.findUnique({ where: { id: newUserId }, select: { name: true } }))?.name : null;
  await logActivity(tx, {
    type: isReassign ? "LEAD_REASSIGNED" : "LEAD_ASSIGNED",
    title: dealershipChanged
      ? `${isReassign ? "Reassigned" : "Assigned"} to ${dealershipName ?? "central queue"}${repName ? ` · ${repName}` : ""}`
      : `Representative set to ${repName ?? "nobody"}`,
    body: input.reason ?? null,
    contactId: lead.contactId,
    leadId: lead.id,
    dealershipId: newDealershipId,
    userId: input.assignedById ?? null,
    metadata: { type: input.type, from: lead.dealershipId, to: newDealershipId, fromUser: lead.assignedUserId, toUser: newUserId },
  });

  // Notifications
  const link = (id: string) => ({ central: `/crm/contacts/${lead.contactId}`, portal: `/portal/contacts/${lead.contactId}?lead=${id}` });
  if (newDealershipId && dealershipChanged) {
    const managers = await dealershipUserIds(tx, newDealershipId, true);
    await notify(tx, {
      userIds: [...managers, ...(newUserId ? [newUserId] : [])].filter((u) => u !== input.assignedById),
      type: isReassign ? "LEAD_REASSIGNED" : "LEAD_ASSIGNED",
      title: `New lead: ${name}`,
      body: `Lead #${lead.number} has been ${isReassign ? "reassigned" : "assigned"} to ${dealershipName}.`,
      link: link(lead.id),
      entityType: "Lead",
      entityId: lead.id,
    });
  } else if (newUserId && newUserId !== input.assignedById) {
    await notify(tx, {
      userIds: [newUserId],
      type: "LEAD_ASSIGNED",
      title: `Lead assigned to you: ${name}`,
      body: `Lead #${lead.number} is now yours.`,
      link: link(lead.id),
      entityType: "Lead",
      entityId: lead.id,
    });
  }
  if (isReassign && lead.dealershipId) {
    const prevManagers = await dealershipUserIds(tx, lead.dealershipId, true);
    await notify(tx, {
      userIds: prevManagers.filter((u) => u !== input.assignedById),
      type: "LEAD_REASSIGNED",
      title: `Lead moved away: ${name}`,
      body: `Lead #${lead.number} was reassigned to ${dealershipName}.`,
      entityType: "Lead",
      entityId: lead.id,
    });
  }

  return { changed: true, history };
}
