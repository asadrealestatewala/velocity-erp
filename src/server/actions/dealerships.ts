"use server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit, diff } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { dealershipUserIds, notify } from "@/server/services/notifications";

const optStr = (max = 200) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
const hours = z.record(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean().optional() }));

const dealershipSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and dashes"),
  type: z.enum(["DEALERSHIP", "OUTLET", "FRANCHISE", "SUB_DEALER"]),
  legalName: optStr(160),
  parentId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  contactName: optStr(120),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable().optional()),
  phone: optStr(30),
  provinceId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  cityId: z.string().min(1, "City is required"),
  address: optStr(300),
  postalCode: optStr(20),
  latitude: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(-90).max(90).nullable().optional()),
  longitude: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(-180).max(180).nullable().optional()),
  openingDate: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable().optional()),
  operatingHours: hours.default({}),
  testDriveSlotCapacity: z.coerce.number().int().min(0).max(50).default(0),
  repsSeeAllLeads: z.boolean().default(false),
  notes: optStr(2000),
});
export type DealershipInput = z.input<typeof dealershipSchema>;

export async function saveDealershipAction(id: string | null, input: DealershipInput) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const v = dealershipSchema.parse(input);
    const city = await db.city.findUnique({ where: { id: v.cityId } });
    if (!city) throw new AppError("Choose a valid city.", "VALIDATION", { cityId: "Invalid city" });
    const clash = await db.dealership.findFirst({ where: { code: v.code, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That dealership code is already used.", "CONFLICT", { code: "Already used" });
    if (id && v.parentId === id) throw new AppError("A dealership cannot be its own parent.");
    const data = { ...v, provinceId: v.provinceId ?? city.provinceId, operatingHours: v.operatingHours as Prisma.InputJsonValue };
    if (id) {
      const before = await db.dealership.findUnique({ where: { id } });
      if (!before) throw notFound();
      // Profile edits never reassign existing leads, even if the city changes.
      await db.dealership.update({ where: { id }, data });
      await audit({ userId: user.id, action: "dealership.updated", entityType: "Dealership", entityId: id, changes: diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>) });
      return { ok: true as const, data: { id }, message: "Dealership saved." };
    }
    const created = await db.dealership.create({ data: { ...data, status: "PENDING", acceptsLeads: false } });
    await audit({ userId: user.id, action: "dealership.created", entityType: "Dealership", entityId: created.id, changes: { code: v.code } });
    return { ok: true as const, data: { id: created.id }, message: "Dealership created as Pending. Activate it once onboarding is complete." };
  });
}

export async function setDealershipStatusAction(id: string, status: "PENDING" | "ACTIVE" | "SUSPENDED" | "INACTIVE", reason?: string) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const d = await db.dealership.findUnique({ where: { id } });
    if (!d) throw notFound();
    await db.$transaction(async (tx) => {
      // Leaving ACTIVE always switches lead assignment off.
      await tx.dealership.update({ where: { id }, data: { status, ...(status !== "ACTIVE" ? { acceptsLeads: false } : {}) } });
      await audit({ userId: user.id, action: "dealership.status_changed", entityType: "Dealership", entityId: id, changes: { status: { from: d.status, to: status }, reason: reason ?? null } }, tx);
      await notify(tx, {
        userIds: await dealershipUserIds(tx, id, true), type: "DEALERSHIP_ONBOARDING",
        title: `${d.name} is now ${status.toLowerCase()}`, body: reason, link: { portal: "/portal/dashboard" }, entityType: "Dealership", entityId: id,
      });
    });
    return { ok: true as const, message: `Status set to ${status.toLowerCase()}.` };
  });
}

/** Activating lead assignment requires an active dealership with a manager and configured models. */
export async function setAcceptsLeadsAction(id: string, accepts: boolean) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const d = await db.dealership.findUnique({ where: { id }, include: { _count: { select: { bikeModels: true } }, memberships: { where: { isActive: true, role: "MANAGER" } } } });
    if (!d) throw notFound();
    if (accepts) {
      const missing = [d.status !== "ACTIVE" && "activate the dealership", !d.memberships.length && "add a dealership manager", !d._count.bikeModels && "configure eligible bike models"].filter(Boolean);
      if (missing.length) throw new AppError(`Before enabling lead assignment: ${missing.join(", ")}.`);
    }
    await db.dealership.update({ where: { id }, data: { acceptsLeads: accepts } });
    await audit({ userId: user.id, action: accepts ? "dealership.leads_enabled" : "dealership.leads_disabled", entityType: "Dealership", entityId: id });
    return { ok: true as const, message: accepts ? "Lead assignment enabled." : "Lead assignment paused — existing leads stay assigned." };
  });
}

export async function setDealershipModelsAction(id: string, modelIds: string[]) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const ids = z.array(z.string()).max(200).parse(modelIds);
    const valid = await db.bikeModel.findMany({ where: { id: { in: ids } }, select: { id: true } });
    await db.$transaction([
      db.dealershipBikeModel.deleteMany({ where: { dealershipId: id } }),
      db.dealershipBikeModel.createMany({ data: valid.map((m) => ({ dealershipId: id, bikeModelId: m.id })) }),
    ]);
    await audit({ userId: user.id, action: "dealership.models_updated", entityType: "Dealership", entityId: id, changes: { models: valid.length } });
    return { ok: true as const, message: "Eligible models updated." };
  });
}
