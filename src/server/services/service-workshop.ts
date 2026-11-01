import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { JOB_CARD_EDITABLE, JOB_CARD_FLOW, SERVICE_BOOKING_FLOW } from "@/lib/ops-constants";
import { AppError, notFound } from "@/server/errors";
import { adjustStock, resolveItem, warnIfLow } from "@/server/services/inventory";
import { centralUserIdsWith, dealershipUserIds, notify } from "@/server/services/notifications";

// After-sales: workshop bookings, job cards, spare-parts consumption and warranty claims.
// Every function takes the caller's transaction so stock, totals and status always change together.

const round2 = (n: number) => Math.round(n * 100) / 100;
const isEditable = (status: string) => (JOB_CARD_EDITABLE as readonly string[]).includes(status);

/** Lock the job card row so concurrent edits (parts, status) on the same job serialise. */
async function lockJob(tx: Tx, jobCardId: string) {
  await tx.$queryRaw`SELECT "id" FROM "JobCard" WHERE "id" = ${jobCardId} FOR UPDATE`;
  const job = await tx.jobCard.findUnique({ where: { id: jobCardId } });
  if (!job) throw notFound("Job card not found.");
  return job;
}

/** Recompute parts total and grand total. Warranty jobs bill the customer nothing. */
export async function recalcJobCard(tx: Tx, jobCardId: string) {
  const job = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, include: { parts: { select: { lineTotal: true } } } });
  const partsTotal = round2(job.parts.reduce((s, p) => s + Number(p.lineTotal), 0));
  const gross = round2(Number(job.labourCharge) + partsTotal);
  if (Number(job.discount) > gross) throw new AppError("The discount can't be more than labour plus parts.", "VALIDATION", { discount: "Too high" });
  const total = job.isWarranty ? 0 : round2(gross - Number(job.discount));
  return tx.jobCard.update({ where: { id: jobCardId }, data: { partsTotal, total } });
}

// ───────── Bookings ─────────

export type CustomerSnapshot = { contactId?: string | null; customerName?: string | null; customerPhone?: string | null };
export type VehicleSnapshot = { vehicleLabel?: string | null; plateNumber?: string | null; chassisNo?: string | null };

async function resolveCustomer(tx: Tx, c: CustomerSnapshot) {
  if (!c.contactId) return { contactId: null, customerName: (c.customerName ?? "").trim(), customerPhone: c.customerPhone ?? null };
  const contact = await tx.contact.findUnique({ where: { id: c.contactId }, select: { firstName: true, lastName: true, phone: true } });
  if (!contact) throw notFound("Contact not found.");
  return {
    contactId: c.contactId,
    customerName: c.customerName?.trim() || [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    customerPhone: c.customerPhone ?? contact.phone ?? null,
  };
}

export async function createServiceBooking(
  tx: Tx,
  p: CustomerSnapshot & VehicleSnapshot & { dealershipId: string; userId: string; serviceType: string; scheduledAt: Date; assignedUserId?: string | null; notes?: string | null; confirmNow?: boolean },
) {
  if (p.scheduledAt.getTime() < Date.now() - 60 * 60 * 1000) throw new AppError("Choose a date and time that has not passed.", "VALIDATION", { date: "In the past" });
  if (p.assignedUserId) await assertTeamMember(tx, p.dealershipId, p.assignedUserId);
  const customer = await resolveCustomer(tx, p);
  return tx.serviceBooking.create({
    data: {
      dealershipId: p.dealershipId,
      ...customer,
      vehicleLabel: p.vehicleLabel ?? null,
      plateNumber: p.plateNumber ?? null,
      chassisNo: p.chassisNo ?? null,
      serviceType: p.serviceType,
      scheduledAt: p.scheduledAt,
      status: p.confirmNow ? "CONFIRMED" : "REQUESTED",
      notes: p.notes ?? null,
      assignedUserId: p.assignedUserId ?? null,
      createdById: p.userId,
    },
  });
}

export async function assertTeamMember(tx: Tx, dealershipId: string, userId: string) {
  const m = await tx.dealershipMembership.findFirst({ where: { dealershipId, userId, isActive: true, user: { isActive: true } } });
  if (!m) throw new AppError("That person is not a member of this dealership.");
}

export async function setServiceBookingStatus(tx: Tx, bookingId: string, status: "CONFIRMED" | "CANCELLED" | "NO_SHOW", reason?: string | null) {
  const b = await tx.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!b) throw notFound("Booking not found.");
  if (!SERVICE_BOOKING_FLOW[b.status]?.includes(status)) throw new AppError(`A ${b.status.toLowerCase().replace("_", "-")} booking can't be changed to ${status.toLowerCase().replace("_", "-")}.`, "CONFLICT");
  // Claim the transition so two simultaneous clicks can't both apply.
  const claimed = await tx.serviceBooking.updateMany({
    where: { id: bookingId, status: b.status },
    data: { status, ...(status === "CANCELLED" ? { cancelReason: reason ?? null } : {}) },
  });
  if (claimed.count !== 1) throw new AppError("This booking was just updated. Refresh and try again.", "CONFLICT");
  return { before: b.status, after: status };
}

// ───────── Job cards ─────────

export async function openJobCard(
  tx: Tx,
  p: CustomerSnapshot & VehicleSnapshot & { dealershipId: string; userId: string; complaint: string; odometerKm?: number | null; isWarranty?: boolean; technicianId?: string | null; bookingId?: string | null },
) {
  if (p.technicianId) await assertTeamMember(tx, p.dealershipId, p.technicianId);
  let customer: CustomerSnapshot = p;
  let vehicle: VehicleSnapshot = p;
  if (p.bookingId) {
    // Checking a booking in: it must be this dealership's, still upcoming, and not already carrying a job.
    const claimed = await tx.serviceBooking.updateMany({ where: { id: p.bookingId, dealershipId: p.dealershipId, status: { in: ["REQUESTED", "CONFIRMED"] } }, data: { status: "CHECKED_IN" } });
    if (claimed.count !== 1) throw new AppError("This booking can't be checked in — it is already checked in, closed or cancelled.", "CONFLICT");
    const b = await tx.serviceBooking.findUniqueOrThrow({ where: { id: p.bookingId } });
    customer = { contactId: b.contactId, customerName: b.customerName, customerPhone: b.customerPhone };
    vehicle = { vehicleLabel: b.vehicleLabel, plateNumber: b.plateNumber, chassisNo: b.chassisNo };
  }
  const c = await resolveCustomer(tx, customer);
  const job = await tx.jobCard.create({
    data: {
      dealershipId: p.dealershipId,
      bookingId: p.bookingId ?? null,
      ...c,
      vehicleLabel: vehicle.vehicleLabel ?? null,
      plateNumber: vehicle.plateNumber ?? null,
      chassisNo: vehicle.chassisNo ?? null,
      odometerKm: p.odometerKm ?? null,
      complaint: p.complaint,
      isWarranty: p.isWarranty ?? false,
      technicianId: p.technicianId ?? null,
      createdById: p.userId,
    },
  });
  return job;
}

export async function updateJobCard(
  tx: Tx,
  jobCardId: string,
  v: { diagnosis?: string | null; workDone?: string | null; odometerKm?: number | null; labourCharge: number; discount: number; isWarranty: boolean; technicianId?: string | null },
) {
  const job = await lockJob(tx, jobCardId);
  if (!isEditable(job.status)) throw new AppError("This job card is closed and can no longer be edited.", "CONFLICT");
  if (v.technicianId) await assertTeamMember(tx, job.dealershipId, v.technicianId);
  if (v.isWarranty !== job.isWarranty && v.isWarranty === false) {
    const live = await tx.warrantyClaim.count({ where: { jobCardId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } } });
    if (live) throw new AppError("This job has a warranty claim — discard the draft claim first (a submitted claim keeps the job a warranty job).", "CONFLICT");
  }
  await tx.jobCard.update({
    where: { id: jobCardId },
    data: {
      diagnosis: v.diagnosis ?? null, workDone: v.workDone ?? null, odometerKm: v.odometerKm ?? null,
      labourCharge: v.labourCharge, discount: v.discount, isWarranty: v.isWarranty, technicianId: v.technicianId ?? null,
    },
  });
  return recalcJobCard(tx, jobCardId);
}

/** Move a job through its workflow. Cancelling returns every consumed part to stock. */
export async function setJobCardStatus(tx: Tx, jobCardId: string, status: "IN_PROGRESS" | "AWAITING_PARTS" | "COMPLETED" | "DELIVERED" | "CANCELLED", userId: string, reason?: string | null) {
  const job = await lockJob(tx, jobCardId);
  if (!JOB_CARD_FLOW[job.status]?.includes(status)) throw new AppError(`This job is ${job.status.toLowerCase().replace("_", " ")} and can't move to ${status.toLowerCase().replace("_", " ")}.`, "CONFLICT");
  const now = new Date();
  if (status === "CANCELLED") {
    const parts = await tx.jobCardPart.findMany({ where: { jobCardId } });
    for (const part of parts) {
      await adjustStock(tx, {
        dealershipId: job.dealershipId, ref: { productId: part.productId }, delta: part.quantity, reason: "SERVICE_RETURN",
        refType: "JobCard", refId: job.id, note: `Job card JC-${job.number} cancelled`, userId,
      });
    }
    await tx.jobCardPart.deleteMany({ where: { jobCardId } });
    await tx.jobCard.update({ where: { id: jobCardId }, data: { status, cancelledAt: now, cancelReason: reason ?? null, partsTotal: 0, total: 0 } });
    // Warranty claims that never reached YADEA go with the job.
    await tx.warrantyClaim.deleteMany({ where: { jobCardId, status: "DRAFT" } });
    if (job.bookingId) await tx.serviceBooking.updateMany({ where: { id: job.bookingId, status: "CHECKED_IN" }, data: { status: "CANCELLED", cancelReason: reason ?? "Job card cancelled" } });
    return { before: job.status, after: status };
  }
  if (status === "COMPLETED" && !job.workDone && !job.diagnosis) {
    throw new AppError("Record the diagnosis or the work done before marking the job ready.", "VALIDATION", { workDone: "Required" });
  }
  await tx.jobCard.update({
    where: { id: jobCardId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? now : status === "IN_PROGRESS" && job.status === "COMPLETED" ? null : undefined,
      deliveredAt: status === "DELIVERED" ? now : undefined,
    },
  });
  if (status === "DELIVERED" && job.bookingId) await tx.serviceBooking.updateMany({ where: { id: job.bookingId, status: "CHECKED_IN" }, data: { status: "COMPLETED" } });
  return { before: job.status, after: status };
}

/** Consume a spare part on a job: deducts the showroom's stock and adds a priced line. */
export async function addJobCardPart(tx: Tx, jobCardId: string, p: { productId: string; quantity: number; unitPrice?: number | null; userId: string }) {
  const job = await lockJob(tx, jobCardId);
  if (!isEditable(job.status)) throw new AppError("Parts can only be added while the job is open.", "CONFLICT");
  const item = await resolveItem(tx, { productId: p.productId });
  const unitPrice = p.unitPrice ?? (item.price ? Number(item.price) : null);
  if (unitPrice == null) throw new AppError(`${item.name} has no price — enter the price to charge.`, "VALIDATION", { unitPrice: "Required" });
  const { item: stockRow } = await adjustStock(tx, {
    dealershipId: job.dealershipId, ref: { productId: p.productId }, delta: -p.quantity, reason: "SERVICE_USE",
    refType: "JobCard", refId: job.id, note: `Job card JC-${job.number}`, userId: p.userId,
  });
  const part = await tx.jobCardPart.create({
    data: { jobCardId, productId: p.productId, name: item.name, code: item.code, quantity: p.quantity, unitPrice, lineTotal: round2(unitPrice * p.quantity) },
  });
  await recalcJobCard(tx, jobCardId);
  await warnIfLow(tx, job.dealershipId, [stockRow.id]);
  return part;
}

/** Take a part off the job and put it back on the shelf (a separate stock movement — history is never edited). */
export async function removeJobCardPart(tx: Tx, jobCardId: string, partId: string, userId: string) {
  const job = await lockJob(tx, jobCardId);
  if (!isEditable(job.status)) throw new AppError("Parts can only be removed while the job is open.", "CONFLICT");
  const part = await tx.jobCardPart.findFirst({ where: { id: partId, jobCardId } });
  if (!part) throw notFound("That part is not on this job card.");
  const claimed = await tx.warrantyClaim.count({ where: { jobCardPartId: partId, status: { in: ["SUBMITTED", "APPROVED"] } } });
  if (claimed) throw new AppError("This part is part of a submitted warranty claim and can't be removed.", "CONFLICT");
  await tx.jobCardPart.delete({ where: { id: partId } });
  await adjustStock(tx, {
    dealershipId: job.dealershipId, ref: { productId: part.productId }, delta: part.quantity, reason: "SERVICE_RETURN",
    refType: "JobCard", refId: job.id, note: `Removed from JC-${job.number}`, userId,
  });
  await recalcJobCard(tx, jobCardId);
  return part;
}

// ───────── Warranty claims ─────────

/** What YADEA is asked to cover: labour plus all parts on the job, or just one part. */
export async function createWarrantyClaim(tx: Tx, p: { jobCardId: string; dealershipId: string; userId: string; jobCardPartId?: string | null; failureDescription: string; claimAmount?: number | null }) {
  const job = await lockJob(tx, p.jobCardId);
  if (job.dealershipId !== p.dealershipId) throw notFound("Job card not found.");
  if (!job.isWarranty) throw new AppError("Only warranty jobs can have a warranty claim. Mark the job card as a warranty job first.", "VALIDATION");
  if (job.status === "CANCELLED") throw new AppError("This job was cancelled.", "CONFLICT");
  const open = await tx.warrantyClaim.count({ where: { jobCardId: p.jobCardId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } } });
  if (open) throw new AppError("This job already has a warranty claim.", "CONFLICT");
  let eligible = round2(Number(job.labourCharge) + Number(job.partsTotal));
  if (p.jobCardPartId) {
    const part = await tx.jobCardPart.findFirst({ where: { id: p.jobCardPartId, jobCardId: p.jobCardId } });
    if (!part) throw notFound("That part is not on this job card.");
    eligible = Number(part.lineTotal);
  }
  const claimAmount = p.claimAmount ?? eligible;
  if (claimAmount > eligible) throw new AppError(`The claim can't exceed the ${fmtMoney(eligible, job.currency)} charged on this job.`, "VALIDATION", { claimAmount: "Too high" });
  return tx.warrantyClaim.create({
    data: {
      dealershipId: job.dealershipId, jobCardId: job.id, jobCardPartId: p.jobCardPartId ?? null, contactId: job.contactId,
      customerName: job.customerName, vehicleLabel: job.vehicleLabel, plateNumber: job.plateNumber, chassisNo: job.chassisNo,
      failureDescription: p.failureDescription, claimAmount, currency: job.currency, createdById: p.userId,
    },
  });
}

export async function submitWarrantyClaim(tx: Tx, claimId: string, dealershipId: string) {
  const claim = await tx.warrantyClaim.findFirst({ where: { id: claimId, dealershipId }, include: { jobCard: { select: { status: true, number: true } } } });
  if (!claim) throw notFound("Claim not found.");
  if (claim.jobCard.status !== "COMPLETED" && claim.jobCard.status !== "DELIVERED") throw new AppError("Finish the job before submitting its warranty claim.", "VALIDATION");
  const claimed = await tx.warrantyClaim.updateMany({ where: { id: claimId, status: "DRAFT" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("This claim has already been submitted.", "CONFLICT");
  const dealer = await tx.dealership.findUniqueOrThrow({ where: { id: dealershipId }, select: { name: true } });
  await notify(tx, {
    userIds: await centralUserIdsWith(tx, "warranty.review"),
    type: "WARRANTY_SUBMITTED",
    title: `Warranty claim WC-${claim.number} from ${dealer.name}`,
    body: `${fmtMoney(Number(claim.claimAmount), claim.currency)} — ${claim.failureDescription.slice(0, 120)}`,
    link: { central: "/crm/warranty-claims" },
    entityType: "WarrantyClaim",
    entityId: claim.id,
  });
  return claim;
}

/** A draft that was raised in error can be deleted; a submitted one is YADEA's record and can't. */
export async function discardWarrantyClaim(tx: Tx, claimId: string, dealershipId: string) {
  const res = await tx.warrantyClaim.deleteMany({ where: { id: claimId, dealershipId, status: "DRAFT" } });
  if (res.count !== 1) throw new AppError("Only draft claims can be discarded.", "CONFLICT");
}

export async function reviewWarrantyClaim(tx: Tx, p: { claimId: string; userId: string; decision: "APPROVED" | "REJECTED"; approvedAmount?: number | null; note?: string | null }) {
  const claim = await tx.warrantyClaim.findUnique({ where: { id: p.claimId } });
  if (!claim) throw notFound("Claim not found.");
  const approvedAmount = p.decision === "APPROVED" ? (p.approvedAmount ?? Number(claim.claimAmount)) : null;
  if (approvedAmount != null && approvedAmount > Number(claim.claimAmount)) throw new AppError("The approved amount can't exceed the amount claimed.", "VALIDATION", { approvedAmount: "Too high" });
  const claimed = await tx.warrantyClaim.updateMany({
    where: { id: p.claimId, status: "SUBMITTED" },
    data: { status: p.decision, approvedAmount, reviewNote: p.note ?? null, reviewedById: p.userId, reviewedAt: new Date() },
  });
  if (claimed.count !== 1) throw new AppError("This claim has already been reviewed.", "CONFLICT");
  await notify(tx, {
    userIds: await dealershipUserIds(tx, claim.dealershipId, true),
    type: "WARRANTY_REVIEWED",
    title: `Warranty claim WC-${claim.number} ${p.decision === "APPROVED" ? "approved" : "rejected"}`,
    body: p.decision === "APPROVED" ? `${fmtMoney(approvedAmount!, claim.currency)} approved.${p.note ? ` ${p.note}` : ""}` : p.note ?? undefined,
    link: { portal: "/portal/warranty" },
    entityType: "WarrantyClaim",
    entityId: claim.id,
  });
  return claim;
}

export const jobCardInclude = {
  parts: { orderBy: { createdAt: "asc" } },
  technician: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
  claims: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.JobCardInclude;

export async function findJobCard(where: Prisma.JobCardWhereInput) {
  return db.jobCard.findFirst({ where, include: jobCardInclude });
}
