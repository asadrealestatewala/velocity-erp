import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/server/errors";
import type { CurrentUser } from "@/server/auth/session";
import { childScope } from "@/server/authz";

export const vehicleInclude = {
  bikeModel: { select: { id: true, name: true, code: true } },
  ownerContact: { select: { id: true, firstName: true, lastName: true, phone: true } },
  salesOrder: { select: { id: true, number: true } },
} satisfies Prisma.VehicleInclude;

/** Showroom units, newest first. `q` matches chassis, engine, plate or owner name. */
export async function listVehicles(dealershipId: string, opts: { q?: string; status?: "IN_STOCK" | "SOLD" | "DAMAGED" } = {}) {
  const q = opts.q?.trim();
  const where: Prisma.VehicleWhereInput = {
    dealershipId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(q
      ? {
          OR: [
            { chassisNumber: { contains: q, mode: "insensitive" } },
            { engineNumber: { contains: q, mode: "insensitive" } },
            { plateNumber: { contains: q, mode: "insensitive" } },
            { ownerContact: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } },
          ],
        }
      : {}),
  };
  return db.vehicle.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: vehicleInclude });
}

/** A customer's vehicle history, restricted to the dealerships the user may see (central sees all). */
export async function vehiclesForContact(user: CurrentUser, contactId: string) {
  return db.vehicle.findMany({
    where: { ownerContactId: contactId, ...childScope(user) },
    orderBy: { soldAt: "desc" },
    include: vehicleInclude,
  });
}

/** Put the units of a cancelled order back in stock and clear their owner and registration. Returns the chassis numbers. */
export async function releaseVehiclesForOrder(tx: Tx, orderId: string) {
  const units = await tx.vehicle.findMany({ where: { salesOrderId: orderId }, select: { id: true, chassisNumber: true } });
  if (units.length === 0) return [];
  await tx.vehicle.updateMany({
    where: { salesOrderId: orderId },
    data: { status: "IN_STOCK", salesOrderId: null, ownerContactId: null, soldAt: null, registrationStatus: "NOT_REGISTERED", plateNumber: null, registeredAt: null },
  });
  return units.map((u) => u.chassisNumber);
}

/** Assign an in-stock unit to a confirmed order of the same showroom; the order must have an unfilled line for its model. */
export async function assignVehicleToOrder(tx: Tx, p: { dealershipId: string; vehicleId: string; salesOrderId: string }) {
  const vehicle = await tx.vehicle.findFirst({ where: { id: p.vehicleId, dealershipId: p.dealershipId } });
  if (!vehicle) throw notFound("Vehicle not found.");
  if (vehicle.status !== "IN_STOCK") throw new AppError("Only units that are in stock can be sold.", "CONFLICT");
  const order = await tx.salesOrder.findFirst({ where: { id: p.salesOrderId, dealershipId: p.dealershipId }, include: { lines: true } });
  if (!order) throw notFound("Order not found.");
  if (order.status !== "CONFIRMED") throw new AppError("Confirm the order before assigning a vehicle to it.", "CONFLICT");
  const ordered = order.lines.filter((l) => l.bikeModelId === vehicle.bikeModelId).reduce((n, l) => n + l.quantity, 0);
  if (ordered === 0) throw new AppError("This order has no line for that bike model.", "CONFLICT");
  const claimed = await tx.vehicle.updateMany({
    where: { id: vehicle.id, status: "IN_STOCK" },
    data: { status: "SOLD", salesOrderId: order.id, ownerContactId: order.contactId, soldAt: new Date() },
  });
  if (claimed.count !== 1) throw new AppError("This unit was just sold.", "CONFLICT");
  const assigned = await tx.vehicle.count({ where: { salesOrderId: order.id, bikeModelId: vehicle.bikeModelId } });
  if (assigned > ordered) throw new AppError(`All ${ordered} unit(s) of this model on the order already have a chassis number.`, "CONFLICT");
  return { vehicle, order };
}
