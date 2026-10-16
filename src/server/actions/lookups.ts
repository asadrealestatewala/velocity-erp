"use server";
import { db } from "@/lib/db";
import { dealershipIds, isCentral, requireUser } from "@/server/authz";
import { forbidden, runAction } from "@/server/errors";

/** Active members of a dealership, for assignment pickers. Portal users may only list their own dealership. */
export async function dealershipMembersAction(dealershipId: string) {
  return runAction(async () => {
    const user = await requireUser();
    if (!isCentral(user) && !dealershipIds(user).includes(dealershipId)) throw forbidden();
    const rows = await db.dealershipMembership.findMany({
      where: { dealershipId, isActive: true, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return rows.map((r) => ({ id: r.user.id, name: r.user.name, role: r.role }));
  });
}

/** Central staff who can own leads/tasks. */
export async function centralStaffAction() {
  return runAction(async () => {
    const user = await requireUser();
    if (!isCentral(user)) throw forbidden();
    return db.user.findMany({ where: { isActive: true, role: { scope: "CENTRAL" } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  });
}

/** Outlets eligible to receive leads/test drives (optionally for a model). */
export async function eligibleDealershipsAction(bikeModelId?: string) {
  return runAction(async () => {
    const user = await requireUser();
    return db.dealership.findMany({
      where: {
        status: "ACTIVE",
        ...(isCentral(user) ? { acceptsLeads: true } : { id: { in: dealershipIds(user) } }),
        ...(bikeModelId ? { bikeModels: { some: { bikeModelId } } } : {}),
      },
      select: { id: true, name: true, code: true, city: { select: { name: true } } },
      orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
    });
  });
}
