import "server-only";
import { db } from "@/lib/db";
import type { DealerSetupCounts } from "@/lib/dealer-onboarding";

/** Real-record counts for one dealership's setup checklist. */
export async function getDealerSetupCounts(dealershipId: string): Promise<DealerSetupCounts> {
  const [d, activeMembers, vehicles, customers] = await Promise.all([
    db.dealership.findUnique({ where: { id: dealershipId }, select: { contactName: true, phone: true, email: true, operatingHours: true } }),
    db.dealershipMembership.count({ where: { dealershipId, isActive: true, user: { isActive: true } } }),
    db.vehicle.count({ where: { dealershipId } }),
    db.contact.count({ where: { type: "CUSTOMER", leads: { some: { dealershipId } } } }),
  ]);
  const hours = (d?.operatingHours ?? {}) as Record<string, unknown>;
  return { hasContactDetails: !!(d?.contactName && (d.phone || d.email)), hasOperatingHours: Object.keys(hours).length > 0, activeMembers, vehicles, customers };
}
