"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { contactScope, isCentral, requireUser } from "@/server/authz";
import { accessibleContact, requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { forbidden, notFound, runAction } from "@/server/errors";
import { fullName, normalizePhone } from "@/lib/utils";
import { scheduleAt } from "@/server/services/test-drives";
import {
  addJobCardPart, createServiceBooking, createWarrantyClaim, discardWarrantyClaim, openJobCard, removeJobCardPart,
  reviewWarrantyClaim, setJobCardStatus, setServiceBookingStatus, submitWarrantyClaim, updateJobCard,
} from "@/server/services/service-workshop";
import {
  jobCardPartSchema, jobCardSchema, jobCardUpdateSchema, serviceBookingSchema, warrantyClaimSchema, warrantyReviewSchema,
} from "@/lib/validation-ops";

// All dealership-side actions are scoped to a dealership the signed-in user is an active member of.
// A record in another dealership is reported as "not found" so its id can't be probed.

async function ownJob(userDealerships: string[], id: string) {
  const job = await db.jobCard.findFirst({ where: { id, dealershipId: { in: userDealerships } } });
  if (!job) throw notFound("Job card not found.");
  return job;
}
const myDealerships = (user: { memberships: { dealershipId: string }[] }) => user.memberships.map((m) => m.dealershipId);

/** Contacts the signed-in dealership user may attach to a booking or job card (same scope as the contacts list). */
export async function searchServiceCustomersAction(q: string) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const term = q.trim();
    if (term.length < 2) return [];
    const phone = normalizePhone(term);
    const rows = await db.contact.findMany({
      where: {
        AND: [
          contactScope(user),
          { isArchived: false },
          { OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            ...(phone ? [{ phoneNormalized: { contains: phone } }] : []),
          ] },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    return rows.map((c) => ({ id: c.id, name: fullName(c), phone: c.phone }));
  });
}

// ───────── Bookings ─────────

export async function createServiceBookingAction(dealershipId: string, input: z.input<typeof serviceBookingSchema>) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    requireOwnDealership(user, dealershipId);
    const v = serviceBookingSchema.parse(input);
    if (v.contactId) await accessibleContact(user, v.contactId);
    const booking = await db.$transaction(async (tx) => {
      const b = await createServiceBooking(tx, {
        dealershipId, userId: user.id, contactId: v.contactId, customerName: v.customerName, customerPhone: v.customerPhone,
        vehicleLabel: v.vehicleLabel, plateNumber: v.plateNumber, chassisNo: v.chassisNo, serviceType: v.serviceType,
        scheduledAt: scheduleAt(v.date, v.time), assignedUserId: v.assignedUserId, notes: v.notes, confirmNow: v.confirmNow,
      });
      await audit({ userId: user.id, dealershipId, action: "service.booking_created", entityType: "ServiceBooking", entityId: b.id, changes: { number: b.number, serviceType: b.serviceType } }, tx);
      return b;
    });
    return { ok: true as const, data: { id: booking.id, number: booking.number }, message: `Service booking SB-${booking.number} ${v.confirmNow ? "confirmed" : "requested"}.` };
  });
}

const bookingStatusSchema = z.object({ status: z.enum(["CONFIRMED", "CANCELLED", "NO_SHOW"]), reason: z.string().trim().max(300).optional() });

export async function updateServiceBookingStatusAction(bookingId: string, input: z.input<typeof bookingStatusSchema>) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const v = bookingStatusSchema.parse(input);
    const b = await db.serviceBooking.findFirst({ where: { id: bookingId, dealershipId: { in: myDealerships(user) } } });
    if (!b) throw notFound("Booking not found.");
    await db.$transaction(async (tx) => {
      const r = await setServiceBookingStatus(tx, b.id, v.status, v.reason);
      await audit({ userId: user.id, dealershipId: b.dealershipId, action: "service.booking_status_changed", entityType: "ServiceBooking", entityId: b.id, changes: { number: b.number, status: { from: r.before, to: r.after } } }, tx);
    });
    return { ok: true as const, message: "Booking updated." };
  });
}

// ───────── Job cards ─────────

/** Open a job card — for a walk-in, or by checking in an existing booking (pass `bookingId`). */
export async function openJobCardAction(dealershipId: string, input: z.input<typeof jobCardSchema>, bookingId?: string | null) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    requireOwnDealership(user, dealershipId);
    const v = jobCardSchema.parse(input);
    if (v.contactId) await accessibleContact(user, v.contactId);
    const job = await db.$transaction(async (tx) => {
      const j = await openJobCard(tx, {
        dealershipId, userId: user.id, contactId: v.contactId, customerName: v.customerName, customerPhone: v.customerPhone,
        vehicleLabel: v.vehicleLabel, plateNumber: v.plateNumber, chassisNo: v.chassisNo, odometerKm: v.odometerKm, complaint: v.complaint,
        isWarranty: v.isWarranty, technicianId: v.technicianId, bookingId: bookingId ?? null,
      });
      await audit({ userId: user.id, dealershipId, action: "service.job_opened", entityType: "JobCard", entityId: j.id, changes: { number: j.number, warranty: j.isWarranty, bookingId: bookingId ?? null } }, tx);
      return j;
    });
    return { ok: true as const, data: { id: job.id, number: job.number }, message: `Job card JC-${job.number} opened.` };
  });
}

export async function updateJobCardAction(jobCardId: string, input: z.input<typeof jobCardUpdateSchema>) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const v = jobCardUpdateSchema.parse(input);
    const job = await ownJob(myDealerships(user), jobCardId);
    await db.$transaction(async (tx) => {
      await updateJobCard(tx, job.id, v);
      await audit({ userId: user.id, dealershipId: job.dealershipId, action: "service.job_updated", entityType: "JobCard", entityId: job.id, changes: { number: job.number, labourCharge: v.labourCharge, discount: v.discount, warranty: v.isWarranty } }, tx);
    });
    return { ok: true as const, message: "Job card saved." };
  });
}

const jobStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "AWAITING_PARTS", "COMPLETED", "DELIVERED", "CANCELLED"]),
  reason: z.string().trim().max(300).optional(),
});

export async function updateJobCardStatusAction(jobCardId: string, input: z.input<typeof jobStatusSchema>) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const v = jobStatusSchema.parse(input);
    const job = await ownJob(myDealerships(user), jobCardId);
    await db.$transaction(async (tx) => {
      const r = await setJobCardStatus(tx, job.id, v.status, user.id, v.reason);
      await audit({ userId: user.id, dealershipId: job.dealershipId, action: "service.job_status_changed", entityType: "JobCard", entityId: job.id, changes: { number: job.number, status: { from: r.before, to: r.after }, ...(v.reason ? { reason: v.reason } : {}) } }, tx);
    });
    return { ok: true as const, message: v.status === "CANCELLED" ? `Job card JC-${job.number} cancelled — parts returned to stock.` : "Job card updated." };
  });
}

export async function addJobCardPartAction(jobCardId: string, input: z.input<typeof jobCardPartSchema>) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const v = jobCardPartSchema.parse(input);
    const job = await ownJob(myDealerships(user), jobCardId);
    const part = await db.$transaction(async (tx) => {
      const p = await addJobCardPart(tx, job.id, { productId: v.productId, quantity: v.quantity, unitPrice: v.unitPrice, userId: user.id });
      await audit({ userId: user.id, dealershipId: job.dealershipId, action: "service.part_added", entityType: "JobCard", entityId: job.id, changes: { number: job.number, part: p.name, quantity: p.quantity } }, tx);
      return p;
    });
    return { ok: true as const, message: `${part.quantity} × ${part.name} used — stock updated.` };
  });
}

export async function removeJobCardPartAction(jobCardId: string, partId: string) {
  return runAction(async () => {
    const user = await requireUser("service.manage");
    const job = await ownJob(myDealerships(user), jobCardId);
    await db.$transaction(async (tx) => {
      const p = await removeJobCardPart(tx, job.id, partId, user.id);
      await audit({ userId: user.id, dealershipId: job.dealershipId, action: "service.part_removed", entityType: "JobCard", entityId: job.id, changes: { number: job.number, part: p.name, quantity: p.quantity } }, tx);
    });
    return { ok: true as const, message: "Part removed — returned to stock." };
  });
}

// ───────── Warranty claims ─────────

export async function createWarrantyClaimAction(input: z.input<typeof warrantyClaimSchema>) {
  return runAction(async () => {
    const user = await requireUser("warranty.manage");
    const v = warrantyClaimSchema.parse(input);
    const job = await ownJob(myDealerships(user), v.jobCardId);
    const claim = await db.$transaction(async (tx) => {
      const c = await createWarrantyClaim(tx, { jobCardId: job.id, dealershipId: job.dealershipId, userId: user.id, jobCardPartId: v.jobCardPartId, failureDescription: v.failureDescription, claimAmount: v.claimAmount });
      await audit({ userId: user.id, dealershipId: job.dealershipId, action: "warranty.claim_created", entityType: "WarrantyClaim", entityId: c.id, changes: { number: c.number, jobCard: job.number, amount: Number(c.claimAmount) } }, tx);
      return c;
    });
    return { ok: true as const, data: { id: claim.id, number: claim.number }, message: `Warranty claim WC-${claim.number} saved as a draft.` };
  });
}

export async function submitWarrantyClaimAction(claimId: string) {
  return runAction(async () => {
    const user = await requireUser("warranty.manage");
    const claim = await db.warrantyClaim.findFirst({ where: { id: claimId, dealershipId: { in: myDealerships(user) } } });
    if (!claim) throw notFound("Claim not found.");
    await db.$transaction(async (tx) => {
      await submitWarrantyClaim(tx, claim.id, claim.dealershipId);
      await audit({ userId: user.id, dealershipId: claim.dealershipId, action: "warranty.claim_submitted", entityType: "WarrantyClaim", entityId: claim.id, changes: { number: claim.number, amount: Number(claim.claimAmount) } }, tx);
    });
    return { ok: true as const, message: `Warranty claim WC-${claim.number} sent to YADEA.` };
  });
}

export async function discardWarrantyClaimAction(claimId: string) {
  return runAction(async () => {
    const user = await requireUser("warranty.manage");
    const claim = await db.warrantyClaim.findFirst({ where: { id: claimId, dealershipId: { in: myDealerships(user) } } });
    if (!claim) throw notFound("Claim not found.");
    await db.$transaction((tx) => discardWarrantyClaim(tx, claim.id, claim.dealershipId));
    return { ok: true as const, message: "Draft claim discarded." };
  });
}

/** Central review. Dealership users can never reach this, whatever permissions they were given. */
export async function reviewWarrantyClaimAction(input: z.input<typeof warrantyReviewSchema>) {
  return runAction(async () => {
    const user = await requireUser("warranty.review");
    if (!isCentral(user)) throw forbidden();
    const v = warrantyReviewSchema.parse(input);
    const claim = await db.warrantyClaim.findUnique({ where: { id: v.claimId } });
    if (!claim) throw notFound("Claim not found.");
    await db.$transaction(async (tx) => {
      await reviewWarrantyClaim(tx, { claimId: claim.id, userId: user.id, decision: v.decision, approvedAmount: v.approvedAmount, note: v.note });
      await audit({ userId: user.id, dealershipId: claim.dealershipId, action: v.decision === "APPROVED" ? "warranty.claim_approved" : "warranty.claim_rejected", entityType: "WarrantyClaim", entityId: claim.id, changes: { number: claim.number, approvedAmount: v.approvedAmount ?? null, note: v.note ?? null } }, tx);
    });
    return { ok: true as const, message: v.decision === "APPROVED" ? "Claim approved." : "Claim rejected." };
  });
}
