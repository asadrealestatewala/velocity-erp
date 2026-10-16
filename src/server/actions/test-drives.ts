"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookingSchema } from "@/lib/validation";
import { isCentral, requireUser, testDriveScope } from "@/server/authz";
import { accessibleContact, accessibleLead, assertDealershipMember } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { createBooking, scheduleAt, updateBookingStatus } from "@/server/services/test-drives";
import { logActivity } from "@/server/services/activity";

export async function createTestDriveAction(input: z.input<typeof bookingSchema>) {
  return runAction(async () => {
    const user = await requireUser("testdrives.manage");
    const v = bookingSchema.parse(input);
    await accessibleContact(user, v.contactId);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    assertDealershipMember(user, v.dealershipId);
    // Portal users can only book at the dealership that owns the lead.
    if (!isCentral(user) && lead?.dealershipId && lead.dealershipId !== v.dealershipId) {
      throw new AppError("Book the test drive at the dealership handling this lead.");
    }
    const settings = await getSettings();
    const booking = await db.$transaction((tx) =>
      createBooking(tx, {
        contactId: v.contactId, leadId: lead?.id ?? null, dealershipId: v.dealershipId, bikeModelId: v.bikeModelId,
        scheduledAt: scheduleAt(v.date, v.time), assignedUserId: v.assignedUserId, customerNotes: v.customerNotes,
        internalNotes: v.internalNotes, userId: user.id, confirmNow: v.confirmNow, settings,
      }),
    );
    await audit({ userId: user.id, action: "testdrive.created", entityType: "TestDriveBooking", entityId: booking.id });
    return { ok: true as const, message: `Test drive #${booking.number} ${v.confirmNow ? "scheduled" : "requested"}.` };
  });
}

const statusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  date: z.string().optional(),
  time: z.string().optional(),
  feedback: z.string().trim().max(2000).optional(),
});

export async function updateTestDriveStatusAction(input: z.input<typeof statusSchema>) {
  return runAction(async () => {
    const user = await requireUser("testdrives.manage");
    const v = statusSchema.parse(input);
    const b = await db.testDriveBooking.findFirst({ where: { AND: [{ id: v.bookingId }, testDriveScope(user)] } });
    if (!b) throw notFound("Booking not found.");
    const settings = await getSettings();
    await db.$transaction((tx) =>
      updateBookingStatus(tx, {
        bookingId: b.id, status: v.status, userId: user.id, settings,
        scheduledAt: v.status === "RESCHEDULED" && v.date && v.time ? scheduleAt(v.date, v.time) : null,
        feedback: v.feedback,
      }),
    );
    await audit({ userId: user.id, action: "testdrive.status_changed", entityType: "TestDriveBooking", entityId: b.id, changes: { status: { from: b.status, to: v.status } } });
    return { ok: true as const, message: "Booking updated." };
  });
}

export async function assignTestDriveRepAction(bookingId: string, userId: string | null) {
  return runAction(async () => {
    const user = await requireUser("testdrives.manage");
    const b = await db.testDriveBooking.findFirst({ where: { AND: [{ id: bookingId }, testDriveScope(user)] } });
    if (!b) throw notFound();
    if (userId) {
      const m = await db.dealershipMembership.findFirst({ where: { dealershipId: b.dealershipId, userId, isActive: true } });
      if (!m) throw new AppError("That person is not a member of this outlet.");
    }
    await db.$transaction(async (tx) => {
      await tx.testDriveBooking.update({ where: { id: b.id }, data: { assignedUserId: userId } });
      await logActivity(tx, { type: "TEST_DRIVE_UPDATED", title: "Test-drive representative updated", contactId: b.contactId, leadId: b.leadId, dealershipId: b.dealershipId, userId: user.id });
    });
    return { ok: true as const, message: "Representative updated." };
  });
}

export async function updateTestDriveNotesAction(bookingId: string, internalNotes: string) {
  return runAction(async () => {
    const user = await requireUser("testdrives.manage");
    const b = await db.testDriveBooking.findFirst({ where: { AND: [{ id: bookingId }, testDriveScope(user)] } });
    if (!b) throw notFound();
    await db.testDriveBooking.update({ where: { id: b.id }, data: { internalNotes: z.string().max(2000).parse(internalNotes) } });
    return { ok: true as const, message: "Notes saved." };
  });
}
