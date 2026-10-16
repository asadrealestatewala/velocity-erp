"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { normalizedContactFields } from "@/server/services/contacts";
import { createLead } from "@/server/services/leads";
import { fieldByMapping, type FormField } from "@/lib/forms/schema";

type LogEntry = { at: string; step: string; detail?: string };

async function loadSubmission(id: string) {
  const s = await db.formSubmission.findUnique({ where: { id }, include: { form: true, formVersion: true } });
  if (!s) throw notFound("Submission not found.");
  return s;
}

const appendLog = (log: unknown, step: string, detail?: string): LogEntry[] => [...((log as LogEntry[]) ?? []), { at: new Date().toISOString(), step, detail }];

export async function markSubmissionReviewedAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("submissions.manage");
    const s = await loadSubmission(id);
    await db.formSubmission.update({
      where: { id },
      data: { reviewedById: user.id, reviewedAt: new Date(), status: s.status === "NEW" ? "REVIEWED" : s.status, processingLog: appendLog(s.processingLog, "reviewed", user.name) },
    });
    await audit({ userId: user.id, action: "submission.reviewed", entityType: "FormSubmission", entityId: id });
    return { ok: true as const, message: "Marked as reviewed." };
  });
}

export async function setSubmissionSpamAction(id: string, spam: boolean) {
  return runAction(async () => {
    const user = await requireUser("submissions.manage");
    const s = await loadSubmission(id);
    await db.formSubmission.update({ where: { id }, data: { status: spam ? "SPAM" : "NEW", processingLog: appendLog(s.processingLog, spam ? "marked_spam" : "unmarked_spam", user.name) } });
    await audit({ userId: user.id, action: spam ? "submission.marked_spam" : "submission.unmarked_spam", entityType: "FormSubmission", entityId: id });
    return { ok: true as const, message: spam ? "Marked as spam." : "Restored for processing." };
  });
}

/** Link to an existing contact — the submission keeps a permanent relationship and appears in the contact's history. */
export async function linkSubmissionToContactAction(id: string, contactId: string) {
  return runAction(async () => {
    const user = await requireUser("submissions.manage");
    const s = await loadSubmission(id);
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw notFound("Contact not found.");
    await db.$transaction(async (tx) => {
      await tx.formSubmission.update({ where: { id }, data: { contactId, status: s.status === "SPAM" || s.status === "NEW" ? "REVIEWED" : s.status, processingLog: appendLog(s.processingLog, "linked_contact", contactId) } });
      await logActivity(tx, { type: "FORM_SUBMITTED", title: `Linked submission #${s.number} (${s.form.name})`, contactId, userId: user.id, metadata: { submissionId: id } });
      await audit({ userId: user.id, action: "submission.linked", entityType: "FormSubmission", entityId: id, changes: { contactId } }, tx);
    });
    return { ok: true as const, message: "Submission linked to the contact." };
  });
}

/** Explicitly create a NEW contact from the submitted values (used when automatic processing was skipped). */
export async function createContactFromSubmissionAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("submissions.manage");
    const s = await loadSubmission(id);
    if (s.form.type === "DEALERSHIP_APPLICATION") throw new AppError("Dealership applications are handled in the Applications module.");
    if (s.contactId) throw new AppError("This submission is already linked to a contact.");
    if (!s.firstName) throw new AppError("The submission has no first name to create a contact from.");
    const contact = await db.$transaction(async (tx) => {
      const n = await normalizedContactFields(tx, { phone: s.phone, email: s.email });
      const c = await tx.contact.create({
        data: { firstName: s.firstName!, lastName: s.lastName, phone: s.phone, email: s.email, ...n, cityId: s.cityId, sourceId: s.sourceId, createdById: user.id, ownerId: user.id, consentMarketing: s.consentGiven, consentRecordedAt: s.consentAt, lastActivityAt: new Date() },
      });
      await tx.formSubmission.update({ where: { id }, data: { contactId: c.id, status: "REVIEWED", processingLog: appendLog(s.processingLog, "contact_created_manually", c.id) } });
      await logActivity(tx, { type: "FORM_SUBMITTED", title: `Submitted "${s.form.name}"`, contactId: c.id, userId: user.id, metadata: { submissionId: id } });
      await audit({ userId: user.id, action: "submission.contact_created", entityType: "FormSubmission", entityId: id, changes: { contactId: c.id } }, tx);
      return c;
    });
    return { ok: true as const, data: { contactId: contact.id }, message: "Contact created." };
  });
}

/** Create a lead for a linked contact that has none from this submission. */
export async function createLeadFromSubmissionAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("submissions.manage");
    const s = await loadSubmission(id);
    if (!s.contactId) throw new AppError("Link or create a contact first.");
    if (s.leadId) throw new AppError("A lead already exists for this submission.");
    const fields = (s.formVersion.schema as { fields: FormField[] }).fields;
    const data = s.data as Record<string, unknown>;
    const val = (m: Parameters<typeof fieldByMapping>[1]) => {
      const f = fieldByMapping(fields, m);
      const v = f ? data[f.key] : undefined;
      return typeof v === "string" ? v : null;
    };
    const lead = await db.$transaction(async (tx) => {
      const l = await createLead(tx, {
        contactId: s.contactId!, origin: "COMPANY", inquiryType: s.form.type === "TEST_DRIVE" ? "TEST_DRIVE" : s.form.type === "GENERAL_INQUIRY" ? "GENERAL_INQUIRY" : "OTHER",
        inquiryCategory: val("inquiryCategory"), description: val("message"), sourceId: s.sourceId, cityId: s.cityId, interestedModelId: s.bikeModelId,
        preferredDealershipId: s.dealershipId, sourceFormId: s.formId, createdById: user.id, ownerId: user.id,
      });
      await tx.formSubmission.update({ where: { id }, data: { leadId: l.id, status: "PROCESSED", processingLog: appendLog(s.processingLog, "lead_created_manually", `#${l.number}`) } });
      await audit({ userId: user.id, action: "submission.lead_created", entityType: "FormSubmission", entityId: id, changes: { leadId: l.id } }, tx);
      return l;
    });
    return { ok: true as const, data: { leadId: lead.id }, message: `Lead #${lead.number} created — assign it from the contact or below.` };
  });
}
