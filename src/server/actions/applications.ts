"use server";
import { z } from "zod";
import type { ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { assertWithinPlan } from "@/server/platform/guard";
import { dealershipUserIds, notify } from "@/server/services/notifications";

const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["INFO_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"],
  INFO_REQUIRED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: ["UNDER_REVIEW"],
  WITHDRAWN: [],
};

const statusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"]),
  note: z.string().trim().max(2000).optional(),
});

export async function setApplicationStatusAction(id: string, input: z.input<typeof statusSchema>) {
  return runAction(async () => {
    const user = await requireUser("applications.review");
    const v = statusSchema.parse(input);
    const app = await db.dealershipApplication.findUnique({ where: { id } });
    if (!app) throw notFound();
    if (!TRANSITIONS[app.status].includes(v.status)) throw new AppError(`Cannot move an application from ${app.status.toLowerCase()} to ${v.status.toLowerCase()}.`);
    if ((v.status === "APPROVED" || v.status === "REJECTED") && !v.note) throw new AppError("Record the reason for this decision.", "VALIDATION", { note: "Reason required" });
    if (v.status === "INFO_REQUIRED" && !v.note) throw new AppError("Describe what information is needed.", "VALIDATION", { note: "Required" });

    await db.$transaction(async (tx) => {
      const data: Prisma.DealershipApplicationUpdateInput = { status: v.status, reviewer: app.reviewerId ? undefined : { connect: { id: user.id } } };
      if (v.status === "APPROVED") Object.assign(data, { approvedAt: new Date(), decisionReason: v.note, onboarding: { ...(app.onboarding as object), approvedBy: user.id } });
      if (v.status === "REJECTED") Object.assign(data, { rejectedAt: new Date(), decisionReason: v.note });
      if (v.status === "INFO_REQUIRED") data.infoRequest = v.note;
      await tx.dealershipApplication.update({ where: { id }, data });
      await tx.applicationStatusHistory.create({ data: { applicationId: id, fromStatus: app.status, toStatus: v.status, note: v.note, changedById: user.id } });
      await audit({ userId: user.id, action: "application.status_changed", entityType: "DealershipApplication", entityId: id, changes: { from: app.status, to: v.status, note: v.note ?? null } }, tx);

      // Applicant emails go through the outbox; they are only "sent" if SMTP is configured.
      const subject = {
        INFO_REQUIRED: "Additional information needed for your YADEA dealership application",
        APPROVED: "Your YADEA dealership application has been approved",
        REJECTED: "Update on your YADEA dealership application",
        UNDER_REVIEW: "Your YADEA dealership application is under review",
        WITHDRAWN: "Your YADEA dealership application was withdrawn",
        SUBMITTED: "",
      }[v.status];
      if (subject) {
        await tx.outboxMessage.create({
          data: { to: app.email, subject, body: `Dear ${app.salutation ?? ""} ${app.firstName} ${app.lastName},\n\n${v.status === "INFO_REQUIRED" ? `We need the following to continue reviewing your application (reference #${app.number}):\n\n${v.note}` : v.status === "APPROVED" ? `We're pleased to inform you that application #${app.number} has been approved. Our dealer-development team will contact you about onboarding.` : v.status === "REJECTED" ? `Thank you for your interest. After review, we are unable to proceed with application #${app.number} at this time.` : `Application #${app.number} status: ${v.status.replace("_", " ").toLowerCase()}.`}\n\nYADEA Dealer Development` },
        });
      }
      const watchers = [app.reviewerId, user.id].filter((x): x is string => !!x && x !== user.id);
      await notify(tx, {
        userIds: watchers,
        type: v.status === "INFO_REQUIRED" ? "APPLICATION_INFO_REQUEST" : "APPLICATION_STATUS",
        title: `Application #${app.number} → ${v.status.replace("_", " ").toLowerCase()}`,
        body: app.businessName,
        link: { central: `/crm/applications/${id}` },
        entityType: "DealershipApplication",
        entityId: id,
      });
    });
    return { ok: true as const, message: v.status === "APPROVED" ? "Approved. Continue with onboarding below — the dealership is not active yet." : "Status updated." };
  });
}

export async function assignReviewerAction(id: string, reviewerId: string | null) {
  return runAction(async () => {
    const user = await requireUser("applications.review");
    if (reviewerId) {
      const r = await db.user.findFirst({ where: { id: reviewerId, isActive: true, role: { permissions: { some: { permission: { key: "applications.review" } } } } } });
      if (!r) throw new AppError("That user cannot review applications.");
    }
    await db.$transaction(async (tx) => {
      await tx.dealershipApplication.update({ where: { id }, data: { reviewerId } });
      await audit({ userId: user.id, action: "application.reviewer_assigned", entityType: "DealershipApplication", entityId: id, changes: { reviewerId } }, tx);
      if (reviewerId && reviewerId !== user.id) {
        await notify(tx, { userIds: [reviewerId], type: "APPLICATION_STATUS", title: "Application assigned to you for review", link: { central: `/crm/applications/${id}` }, entityType: "DealershipApplication", entityId: id });
      }
    });
    return { ok: true as const, message: "Reviewer updated." };
  });
}

export async function addApplicationNoteAction(id: string, body: string) {
  return runAction(async () => {
    const user = await requireUser("applications.review");
    const text = z.string().trim().min(1).max(5000).parse(body);
    await db.note.create({ data: { applicationId: id, authorId: user.id, body: text } });
    return { ok: true as const, message: "Review note added." };
  });
}

export async function markOnboardingStepAction(id: string, step: "verified" | "notified", value: boolean) {
  return runAction(async () => {
    const user = await requireUser("applications.review");
    const app = await db.dealershipApplication.findUnique({ where: { id }, include: { dealership: true } });
    if (!app) throw notFound();
    if (app.status !== "APPROVED") throw new AppError("Onboarding starts after approval.");
    if (step === "notified") {
      if (!app.dealership || app.dealership.status !== "ACTIVE" || !app.dealership.acceptsLeads) throw new AppError("Activate the dealership before sending the onboarding notification.");
      await db.$transaction(async (tx) => {
        await tx.outboxMessage.create({ data: { to: app.email, subject: `Welcome to the YADEA network — ${app.dealership!.name} is live`, body: `Dear ${app.firstName},\n\nYour dealership is now active and can receive customer leads. Sign in to the Dealer Portal: ${env.appUrl}/portal/login\n\nYADEA Dealer Development` } });
        await notify(tx, { userIds: await dealershipUserIds(tx, app.dealership!.id), type: "DEALERSHIP_ONBOARDING", title: `${app.dealership!.name} is live`, body: "Your dealership can now receive leads from YADEA.", link: { portal: "/portal/dashboard" } });
      });
    }
    await db.dealershipApplication.update({ where: { id }, data: { onboarding: { ...(app.onboarding as object), [step]: value, [`${step}At`]: new Date().toISOString() } } });
    await audit({ userId: user.id, action: `application.onboarding_${step}`, entityType: "DealershipApplication", entityId: id });
    return { ok: true as const, message: step === "verified" ? "Business information marked as verified." : "Onboarding notification queued." };
  });
}

const convertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers and dashes"),
  type: z.enum(["DEALERSHIP", "OUTLET", "FRANCHISE", "SUB_DEALER"]),
  cityId: z.string().min(1, "City is required"),
  address: z.string().trim().max(300).optional(),
});

/** Converts an approved, verified application into a PENDING dealership (exactly once). */
export async function convertApplicationAction(id: string, input: z.input<typeof convertSchema>) {
  return runAction(async () => {
    const user = await requireUser("applications.review");
    if (!user.permissions.has("dealerships.manage")) throw new AppError("You also need permission to manage dealerships.", "FORBIDDEN");
    const v = convertSchema.parse(input);
    const app = await db.dealershipApplication.findUnique({ where: { id }, include: { dealership: true } });
    if (!app) throw notFound();
    if (app.status !== "APPROVED") throw new AppError("Only approved applications can be converted.");
    if (!(app.onboarding as { verified?: boolean }).verified) throw new AppError("Verify the business information first (onboarding step 1).");
    if (app.dealership) throw new AppError("This application has already been converted.", "CONFLICT");
    if (await db.dealership.findUnique({ where: { code: v.code } })) throw new AppError("That code is already used.", "CONFLICT", { code: "Already used" });
    const city = await db.city.findUnique({ where: { id: v.cityId } });
    if (!city) throw new AppError("Invalid city.");
    await assertWithinPlan("maxDealerships", 1);
    const d = await db.$transaction(async (tx) => {
      const dealer = await tx.dealership.create({
        data: {
          name: v.name, code: v.code, type: v.type, legalName: app.businessName, contactName: `${app.firstName} ${app.lastName}`, email: app.email, phone: app.phone,
          cityId: city.id, provinceId: city.provinceId, address: v.address || app.businessAddress, status: "PENDING", acceptsLeads: false, applicationId: app.id,
          notes: `Created from dealership application #${app.number}.`,
        },
      });
      await tx.dealershipApplication.update({ where: { id }, data: { onboarding: { ...(app.onboarding as object), dealershipCreated: true } } });
      await audit({ userId: user.id, action: "application.converted", entityType: "DealershipApplication", entityId: id, changes: { dealershipId: dealer.id } }, tx);
      await audit({ userId: user.id, action: "dealership.created", entityType: "Dealership", entityId: dealer.id, changes: { fromApplication: app.number } }, tx);
      return dealer;
    });
    return { ok: true as const, data: { dealershipId: d.id }, message: "Dealership record created (Pending). Next: invite the manager." };
  });
}
