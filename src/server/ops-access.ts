import "server-only";
import { db } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";

/**
 * Which dealership a ledger/voucher export may cover for this user, or null when they have no access.
 *  - dealership users: only a dealership they belong to (defaults to their first);
 *  - central users: any dealership, provided they hold the central permission.
 */
export async function exportDealership(user: CurrentUser, requested: string | null, dealerPerm: PermissionKey, centralPerm: PermissionKey) {
  if (isCentral(user)) {
    if (!can(user, centralPerm) || !requested) return null;
    return db.dealership.findUnique({ where: { id: requested }, select: { id: true, name: true, code: true } });
  }
  if (!can(user, dealerPerm)) return null;
  const ids = dealershipIds(user);
  const id = requested && ids.includes(requested) ? requested : requested ? null : ids[0];
  if (!id) return null;
  return db.dealership.findUnique({ where: { id }, select: { id: true, name: true, code: true } });
}

/** Parse a YYYY-MM-DD query value as a calendar day (ledger and voucher dates are stored at 00:00 UTC). */
export function parseDay(v: string | null, end = false) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
