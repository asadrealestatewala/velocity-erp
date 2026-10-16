import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { contactScope, dealershipIds, isCentral, leadScope, managedDealershipIds } from "@/server/authz";
import { AppError, forbidden, notFound } from "@/server/errors";

// Record-level access checks. A record outside the user's scope is reported as "not found"
// so IDs from other dealerships can't even be confirmed to exist.

export async function accessibleContact(user: CurrentUser, contactId: string) {
  const c = await db.contact.findFirst({ where: { AND: [{ id: contactId }, contactScope(user)] } });
  if (!c) throw notFound("Contact not found.");
  return c;
}

export async function accessibleLead(user: CurrentUser, leadId: string) {
  const l = await db.lead.findFirst({ where: { AND: [{ id: leadId }, leadScope(user)] } });
  if (!l) throw notFound("Lead not found.");
  return l;
}

/** The user must be able to act inside this dealership (portal) — central users always can. */
export function assertDealershipMember(user: CurrentUser, dealershipId: string | null | undefined) {
  if (isCentral(user)) return;
  if (!dealershipId || !dealershipIds(user).includes(dealershipId)) throw forbidden();
}

/** A task/follow-up assignee must be someone who can see the lead. */
export async function assertAssignable(user: CurrentUser, assigneeId: string, dealershipId: string | null) {
  if (assigneeId === user.id) return;
  const target = await db.user.findFirst({ where: { id: assigneeId, isActive: true }, include: { role: true, memberships: { where: { isActive: true } } } });
  if (!target) throw new AppError("That user is not available.");
  if (target.role.scope === "CENTRAL") {
    if (!isCentral(user)) throw forbidden("Dealership users can only assign work within their dealership.");
    return;
  }
  if (!dealershipId || !target.memberships.some((m) => m.dealershipId === dealershipId)) {
    throw new AppError("That person is not a member of the lead's dealership.");
  }
  if (!isCentral(user) && !user.memberships.some((m) => m.dealershipId === dealershipId)) throw forbidden();
}

export function assertDealershipManager(user: CurrentUser, dealershipId: string | null | undefined) {
  if (isCentral(user)) return;
  if (!dealershipId || !managedDealershipIds(user).includes(dealershipId)) throw forbidden("Only the dealership manager can do this.");
}
