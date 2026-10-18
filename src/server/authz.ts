import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { AppError, forbidden } from "@/server/errors";
import type { PermissionKey } from "@/lib/permissions";
import { homePathFor } from "@/lib/home";

// ───────── Guards ─────────

export function can(user: CurrentUser | null | undefined, perm: PermissionKey) {
  return !!user && user.permissions.has(perm);
}

export const isCentral = (u: CurrentUser) => u.scope === "CENTRAL";
export const isSuperAdmin = (u: CurrentUser) => u.roleKey === "SUPER_ADMIN";

/** For server actions / route handlers: throws if unauthenticated or missing permission. */
export async function requireUser(perm?: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Your session has expired. Please sign in again.", "UNAUTHENTICATED");
  if (perm && !can(user, perm)) throw forbidden();
  return user;
}

/** Accounts created with a temporary password must set their own before using the app. */
async function enforcePasswordChange(user: CurrentUser, accountPath: string) {
  if (!user.mustChangePassword) return;
  const path = (await headers()).get("x-pathname") ?? "";
  if (path !== accountPath) redirect(accountPath);
}

/** For pages in the central CRM: redirects instead of throwing. */
export async function requireCentralPage(perm?: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCentral(user)) redirect(homePathFor(user.scope, user.permissions));
  await enforcePasswordChange(user, "/crm/account");
  if (perm && !can(user, perm)) {
    // A procurement-only account has no CRM dashboard: send it to its own home instead of a dead end.
    if (!can(user, "dashboard.view") && can(user, "procurement.view")) redirect("/procurement/dashboard");
    redirect("/crm/forbidden");
  }
  return user;
}

/** For pages in the Procurement portal (central users holding procurement permissions). */
export async function requireProcurementPage(perm?: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/procurement/login");
  if (!isCentral(user)) redirect(homePathFor(user.scope, user.permissions));
  await enforcePasswordChange(user, "/procurement/account");
  if (perm && !can(user, perm)) redirect("/procurement/forbidden");
  return user;
}

/** Any permission that opens at least one page of the Procurement portal. */
export const PROCUREMENT_ENTRY_PERMISSIONS: PermissionKey[] = ["procurement.view", "catalog.manage", "inventory.view_all", "ledger.view", "vouchers.view_all", "dealerdocs.admin"];

/** For pages in the dealership portal. */
export async function requirePortalPage(perm?: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (isCentral(user)) redirect(homePathFor(user.scope, user.permissions));
  if (!can(user, "portal.access") || user.memberships.length === 0) redirect("/portal/no-access");
  await enforcePasswordChange(user, "/portal/account");
  if (perm && !can(user, perm)) redirect("/portal/dashboard?denied=1");
  return user;
}

/**
 * The dealership a portal page or action operates on. Most users belong to one; users with several pick one
 * (`?dealership=`). The requested id is only honoured if the user is an active member — never trusted blindly.
 */
export function activeDealershipId(user: CurrentUser, requested?: string | null): string | null {
  const ids = user.memberships.map((m) => m.dealershipId);
  if (requested && ids.includes(requested)) return requested;
  return ids[0] ?? null;
}
// ───────── Data scopes ─────────
// Every query for protected records composes one of these filters. They are the single
// source of truth for dealership-level isolation.

const NONE = "__no_access__";

export function dealershipIds(user: CurrentUser) {
  return user.memberships.map((m) => m.dealershipId);
}

export function managedDealershipIds(user: CurrentUser) {
  return user.memberships.filter((m) => m.role === "MANAGER").map((m) => m.dealershipId);
}

/** Leads the user may see. */
export function leadScope(user: CurrentUser): Prisma.LeadWhereInput {
  if (isCentral(user)) {
    if (can(user, "leads.view_all")) return {};
    return { OR: [{ ownerId: user.id }, { assignedUserId: user.id }, { createdById: user.id }] };
  }
  const or: Prisma.LeadWhereInput[] = [];
  for (const m of user.memberships) {
    if (m.role === "MANAGER" || m.repsSeeAllLeads) or.push({ dealershipId: m.dealershipId });
    else or.push({ dealershipId: m.dealershipId, assignedUserId: user.id });
  }
  return or.length ? { OR: or } : { id: NONE };
}

/** Contacts the user may see: central oversight, or any visible lead attached. */
export function contactScope(user: CurrentUser): Prisma.ContactWhereInput {
  if (isCentral(user)) {
    if (can(user, "leads.view_all")) return {};
    return { OR: [{ ownerId: user.id }, { createdById: user.id }, { leads: { some: leadScope(user) } }] };
  }
  return { leads: { some: leadScope(user) } };
}

/**
 * Child records (activities, notes, tasks, documents, payments) carry the dealership context
 * in which they were created. Dealership users only see their own dealership's records;
 * central notes (dealershipId = null) never leak into a portal.
 */
export function childScope(user: CurrentUser): { dealershipId?: string | { in: string[] } } {
  if (isCentral(user)) return {};
  const ids = dealershipIds(user);
  return { dealershipId: { in: ids.length ? ids : [NONE] } };
}

export function testDriveScope(user: CurrentUser): Prisma.TestDriveBookingWhereInput {
  if (isCentral(user)) return can(user, "leads.view_all") ? {} : { OR: [{ createdById: user.id }, { assignedUserId: user.id }] };
  const or: Prisma.TestDriveBookingWhereInput[] = [];
  for (const m of user.memberships) {
    if (m.role === "MANAGER" || m.repsSeeAllLeads) or.push({ dealershipId: m.dealershipId });
    else or.push({ dealershipId: m.dealershipId, OR: [{ assignedUserId: user.id }, { lead: { assignedUserId: user.id } }] });
  }
  return or.length ? { OR: or } : { id: NONE };
}

export function taskScope(user: CurrentUser): Prisma.TaskWhereInput {
  if (isCentral(user)) return can(user, "leads.view_all") ? {} : { OR: [{ assignedToId: user.id }, { createdById: user.id }] };
  const managed = managedDealershipIds(user);
  return {
    OR: [
      { assignedToId: user.id, dealershipId: { in: dealershipIds(user) } },
      ...(managed.length ? [{ dealershipId: { in: managed } }] : []),
    ],
  };
}

/** The dealership context a new child record should carry, given the lead it relates to. */
export function contextDealershipId(user: CurrentUser, leadDealershipId: string | null | undefined) {
  if (isCentral(user)) return leadDealershipId ?? null;
  const ids = dealershipIds(user);
  if (leadDealershipId && ids.includes(leadDealershipId)) return leadDealershipId;
  return ids[0] ?? null;
}
