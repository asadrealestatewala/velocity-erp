import "server-only";
import type { TestDriveStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { AppError } from "@/server/errors";
import type { SystemSettings } from "@/server/settings";
import { logActivity } from "./activity";
import { award } from "./gamification";
import { advanceToStageKey } from "./leads";
import { dealershipUserIds, notify } from "./notifications";

/** Combine a local date (YYYY-MM-DD) and time (HH:mm) in the app timezone (process TZ, see instrumentation.ts). */
export function scheduleAt(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type OperatingHours = Partial<Record<(typeof DAYS)[number], { open: string; close: string; closed?: boolean }>>;

/**
 * Validates a requested slot: not in the past (respecting minimum notice), within the booking
 * horizon, within the outlet's configured opening hours, and under the slot capacity.
 */
export async function validateBookingSlot(
  tx: Tx,
  { dealershipId, at, settings, excludeBookingId }: { dealershipId: string; at: Date; settings: SystemSettings; excludeBookingId?: string },
): Promise<{ ok: true } | { ok: false; error: string; field: "date" | "time" }> {
  if (isNaN(at.getTime())) return { ok: false, error: "Enter a valid date and time", field: "date" };
  const now = Date.now();
  if (at.getTime() < now + settings.testDrive.minLeadHours * 3600_000) {
    return { ok: false, error: `Please choose a time at least ${settings.testDrive.minLeadHours} hour(s) from now`, field: "date" };
  }
  if (at.getTime() > now + settings.testDrive.maxDaysAhead * 86400_000) {
    return { ok: false, error: `Bookings can be made up to ${settings.testDrive.maxDaysAhead} days ahead`, field: "date" };
  }
  const d = await tx.dealership.findUnique({ where: { id: dealershipId }, select: { operatingHours: true, testDriveSlotCapacity: true } });
  if (!d) return { ok: false, error: "Outlet not found", field: "date" };
  const hours = (d.operatingHours ?? {}) as OperatingHours;
  const day = hours[DAYS[at.getDay()]!];
  if (Object.keys(hours).length) {
    if (!day || day.closed) return { ok: false, error: "The outlet is closed on this day", field: "date" };
    const t = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    if (t < day.open || t >= day.close) return { ok: false, error: `Please choose a time between ${day.open} and ${day.close}`, field: "time" };
  }
  if (d.testDriveSlotCapacity > 0) {
    const overlapping = await tx.testDriveBooking.count({
      where: {
        dealershipId,
        scheduledAt: { gte: new Date(at.getTime() - 30 * 60_000), lt: new Date(at.getTime() + 30 * 60_000) },
        status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    });
    if (overlapping >= d.testDriveSlotCapacity) return { ok: false, error: "This time slot is fully booked. Please choose another time.", field: "time" };
  }
  return { ok: true };
}

/** Allowed status transitions — a request is never treated as confirmed until confirmed explicitly. */
const TRANSITIONS: Record<TestDriveStatus, TestDriveStatus[]> = {
  REQUESTED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "RESCHEDULED", "CANCELLED", "NO_SHOW"],
  RESCHEDULED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ["RESCHEDULED"],
};

export function allowedTransitions(s: TestDriveStatus) {
  return TRANSITIONS[s];
}

export async function updateBookingStatus(
  tx: Tx,
  input: {
    bookingId: string;
    status: TestDriveStatus;
    userId: string;
    scheduledAt?: Date | null;
    feedback?: string | null;
    internalNotes?: string | null;
    settings: SystemSettings;
  },
) {
  const b = await tx.testDriveBooking.findUnique({ where: { id: input.bookingId }, include: { bikeModel: true, contact: true } });
  if (!b) throw new AppError("Booking not found.", "NOT_FOUND");
  if (!TRANSITIONS[b.status].includes(input.status)) {
    throw new AppError(`A ${b.status.toLowerCase()} booking cannot be marked ${input.status.toLowerCase()}.`);
  }
  const data: Parameters<typeof tx.testDriveBooking.update>[0]["data"] = { status: input.status };
  if (input.status === "RESCHEDULED") {
    if (!input.scheduledAt) throw new AppError("Choose the new date and time.", "VALIDATION", { scheduledAt: "Required" });
    const slot = await validateBookingSlot(tx, { dealershipId: b.dealershipId, at: input.scheduledAt, settings: input.settings, excludeBookingId: b.id });
    if (!slot.ok) throw new AppError(slot.error, "VALIDATION", { scheduledAt: slot.error });
    data.scheduledAt = input.scheduledAt;
    data.confirmedAt = null;
  }
  if (input.status === "CONFIRMED") {
    data.confirmedAt = new Date();
    data.confirmedById = input.userId;
  }
  if (input.status === "COMPLETED") data.completedAt = new Date();
  if (input.feedback !== undefined) data.feedback = input.feedback;
  if (input.internalNotes !== undefined) data.internalNotes = input.internalNotes;
  const updated = await tx.testDriveBooking.update({ where: { id: b.id }, data });

  const when = (input.scheduledAt ?? b.scheduledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  await logActivity(tx, {
    type: input.status === "COMPLETED" ? "TEST_DRIVE_COMPLETED" : input.status === "RESCHEDULED" ? "TEST_DRIVE_RESCHEDULED" : "TEST_DRIVE_UPDATED",
    title: `Test drive ${input.status.toLowerCase().replace("_", "-")}: ${b.bikeModel.name}`,
    body: input.status === "RESCHEDULED" ? `New time: ${when}` : (input.feedback ?? null),
    contactId: b.contactId,
    leadId: b.leadId,
    dealershipId: b.dealershipId,
    userId: input.userId,
    metadata: { bookingId: b.id, from: b.status, to: input.status },
  });

  if (b.leadId) {
    if (input.status === "CONFIRMED") await advanceToStageKey(tx, b.leadId, "TEST_DRIVE_SCHEDULED", input.userId);
    if (input.status === "COMPLETED") {
      await advanceToStageKey(tx, b.leadId, "TEST_DRIVE_COMPLETED", input.userId);
    }
  }
  if (input.status === "COMPLETED") {
    await award(tx, { userId: b.assignedUserId ?? input.userId, dealershipId: b.dealershipId, type: "TEST_DRIVE_COMPLETED", uniqueKey: `td-complete:${b.id}`, leadId: b.leadId });
  }
  if (input.status === "RESCHEDULED" && b.assignedUserId && b.assignedUserId !== input.userId) {
    await notify(tx, {
      userIds: [b.assignedUserId],
      type: "TEST_DRIVE_UPCOMING",
      title: `Test drive rescheduled: ${b.contact.firstName}`,
      body: `New time ${when}`,
      link: { portal: `/portal/test-drives?focus=${b.id}`, central: `/crm/test-drives?focus=${b.id}` },
      entityType: "TestDriveBooking",
      entityId: b.id,
    });
  }
  return updated;
}

export async function createBooking(
  tx: Tx,
  input: {
    contactId: string;
    leadId: string | null;
    dealershipId: string;
    bikeModelId: string;
    scheduledAt: Date;
    assignedUserId?: string | null;
    customerNotes?: string | null;
    internalNotes?: string | null;
    userId: string;
    confirmNow?: boolean;
    settings: SystemSettings;
  },
) {
  const d = await tx.dealership.findUnique({ where: { id: input.dealershipId }, include: { bikeModels: true } });
  if (!d || d.status !== "ACTIVE") throw new AppError("The outlet is not active.");
  if (!d.bikeModels.some((m) => m.bikeModelId === input.bikeModelId)) {
    throw new AppError("This outlet is not configured for the selected model.", "VALIDATION", { bikeModelId: "Not offered at this outlet" });
  }
  const model = await tx.bikeModel.findFirst({ where: { id: input.bikeModelId, isActive: true } });
  if (!model) throw new AppError("Select an active bike model.");
  const slot = await validateBookingSlot(tx, { dealershipId: d.id, at: input.scheduledAt, settings: input.settings });
  if (!slot.ok) throw new AppError(slot.error, "VALIDATION", { scheduledAt: slot.error });
  if (input.assignedUserId) {
    const m = await tx.dealershipMembership.findFirst({ where: { dealershipId: d.id, userId: input.assignedUserId, isActive: true } });
    if (!m) throw new AppError("The representative is not a member of this outlet.");
  }
  const booking = await tx.testDriveBooking.create({
    data: {
      contactId: input.contactId,
      leadId: input.leadId,
      dealershipId: d.id,
      cityId: d.cityId,
      bikeModelId: model.id,
      scheduledAt: input.scheduledAt,
      assignedUserId: input.assignedUserId ?? null,
      customerNotes: input.customerNotes ?? null,
      internalNotes: input.internalNotes ?? null,
      status: input.confirmNow ? "CONFIRMED" : "REQUESTED",
      confirmedAt: input.confirmNow ? new Date() : null,
      confirmedById: input.confirmNow ? input.userId : null,
      createdById: input.userId,
    },
  });
  await logActivity(tx, {
    type: "TEST_DRIVE_SCHEDULED",
    title: `Test drive ${input.confirmNow ? "scheduled" : "requested"}: ${model.name}`,
    body: `${input.scheduledAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} at ${d.name}`,
    contactId: input.contactId,
    leadId: input.leadId,
    dealershipId: d.id,
    userId: input.userId,
    metadata: { bookingId: booking.id },
  });
  if (input.leadId) await advanceToStageKey(tx, input.leadId, "TEST_DRIVE_SCHEDULED", input.userId);
  const recipients = new Set(await dealershipUserIds(tx, d.id, true));
  if (input.assignedUserId) recipients.add(input.assignedUserId);
  recipients.delete(input.userId);
  await notify(tx, {
    userIds: [...recipients],
    type: "TEST_DRIVE_BOOKED",
    title: `Test drive booked: ${model.name}`,
    body: input.scheduledAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    link: { portal: `/portal/test-drives?focus=${booking.id}`, central: `/crm/test-drives?focus=${booking.id}` },
    entityType: "TestDriveBooking",
    entityId: booking.id,
  });
  return booking;
}
