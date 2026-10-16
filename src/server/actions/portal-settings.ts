"use server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { managedDealershipIds, requireUser } from "@/server/authz";
import { audit, diff } from "@/server/audit";
import { forbidden, runAction } from "@/server/errors";

const schema = z.object({
  contactName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable().optional()),
  repsSeeAllLeads: z.boolean(),
  testDriveSlotCapacity: z.coerce.number().int().min(0).max(50),
  operatingHours: z.record(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean().optional() })),
});

/** Dealership managers may edit operational settings only — never status, lead routing activation or identity. */
export async function updateOwnDealershipAction(dealershipId: string, input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireUser("team.manage");
    if (!managedDealershipIds(user).includes(dealershipId)) throw forbidden();
    const v = schema.parse(input);
    const before = await db.dealership.findUniqueOrThrow({ where: { id: dealershipId } });
    const data = { ...v, operatingHours: v.operatingHours as Prisma.InputJsonValue };
    await db.dealership.update({ where: { id: dealershipId }, data });
    await audit({ userId: user.id, action: "dealership.updated_by_manager", entityType: "Dealership", entityId: dealershipId, changes: diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>) });
    return { ok: true as const, message: "Dealership settings saved." };
  });
}
