"use server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { assignVehicleToOrder } from "@/server/services/vehicles";
import { vehicleAddSchema, vehicleAssignSchema, vehicleRegistrationSchema } from "@/lib/validation-ops";
import type { z } from "zod";

/** Record one physical unit (chassis, engine number) in the showroom. The stock count is changed separately, as before. */
export async function addVehicleAction(dealershipId: string, input: z.input<typeof vehicleAddSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = vehicleAddSchema.parse(input);
    const model = await db.bikeModel.findFirst({ where: { id: v.bikeModelId, isActive: true } });
    if (!model) throw new AppError("That bike model is not available.", "VALIDATION", { bikeModelId: "Choose a model" });
    try {
      const created = await db.$transaction(async (tx) => {
        const row = await tx.vehicle.create({
          data: { dealershipId, bikeModelId: v.bikeModelId, chassisNumber: v.chassisNumber, engineNumber: v.engineNumber ?? null, color: v.color ?? null, note: v.note ?? null, createdById: user.id },
        });
        await audit({ userId: user.id, dealershipId, action: "vehicle.added", entityType: "Vehicle", entityId: row.id, changes: { model: model.name, chassisNumber: v.chassisNumber, engineNumber: v.engineNumber ?? null } }, tx);
        return row;
      });
      return { ok: true as const, message: `${model.name} ${created.chassisNumber} added.` };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("A vehicle with this chassis number already exists.", "CONFLICT", { chassisNumber: "Already recorded" });
      throw e;
    }
  });
}

/** Link an in-stock unit to a confirmed customer order, which makes the order's customer its owner. */
export async function assignVehicleAction(dealershipId: string, input: z.input<typeof vehicleAssignSchema>) {
  return runAction(async () => {
    const user = await requireUser("salesorders.manage");
    requireOwnDealership(user, dealershipId);
    const v = vehicleAssignSchema.parse(input);
    const { vehicle, order } = await db.$transaction(async (tx) => {
      const r = await assignVehicleToOrder(tx, { dealershipId, ...v });
      await audit({ userId: user.id, dealershipId, action: "vehicle.sold", entityType: "Vehicle", entityId: r.vehicle.id, changes: { chassisNumber: r.vehicle.chassisNumber, salesOrder: r.order.number, ownerContactId: r.order.contactId } }, tx);
      return r;
    });
    return { ok: true as const, message: `${vehicle.chassisNumber} assigned to order SO-${order.number}.` };
  });
}

/** Track the number plate and registration progress of a unit. */
export async function setRegistrationAction(dealershipId: string, input: z.input<typeof vehicleRegistrationSchema>) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    const v = vehicleRegistrationSchema.parse(input);
    const vehicle = await db.vehicle.findFirst({ where: { id: v.vehicleId, dealershipId } });
    if (!vehicle) throw notFound("Vehicle not found.");
    if (vehicle.status !== "SOLD" && v.registrationStatus !== "NOT_REGISTERED") throw new AppError("Only sold vehicles can be registered.", "CONFLICT");
    const plateNumber = v.registrationStatus === "NOT_REGISTERED" ? null : (v.plateNumber ?? null);
    const registeredAt = v.registrationStatus === "REGISTERED" ? (v.registeredAt ?? new Date()) : null;
    try {
      await db.$transaction(async (tx) => {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { registrationStatus: v.registrationStatus, plateNumber, registeredAt } });
        await audit({ userId: user.id, dealershipId, action: "vehicle.registration_updated", entityType: "Vehicle", entityId: vehicle.id, changes: { chassisNumber: vehicle.chassisNumber, status: { from: vehicle.registrationStatus, to: v.registrationStatus }, plateNumber: { from: vehicle.plateNumber, to: plateNumber } } }, tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("That number plate is already recorded on another vehicle.", "CONFLICT", { plateNumber: "Already in use" });
      throw e;
    }
    return { ok: true as const, message: "Registration saved." };
  });
}
