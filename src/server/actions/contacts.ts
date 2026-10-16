"use server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { contactSchema, leadDetailsSchema, type ContactInput } from "@/lib/validation";
import { contactScope, dealershipIds, isCentral, requireUser } from "@/server/authz";
import { accessibleContact, accessibleLead } from "@/server/access";
import { audit, diff } from "@/server/audit";
import { AppError, forbidden, runAction } from "@/server/errors";
import { findDuplicates, normalizedContactFields } from "@/server/services/contacts";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { logActivity } from "@/server/services/activity";
import { saveUpload } from "@/server/storage";
import { fullName } from "@/lib/utils";

export type DuplicateMatch = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  city: string | null;
  stage: string | null;
  dealership: string | null;
  createdAt: string;
  archived: boolean;
};

/** Duplicate lookup for the create/edit form. Portal users only see details of in-scope matches. */
export async function checkDuplicatesAction(input: { phone?: string | null; email?: string | null; excludeId?: string }) {
  return runAction(async () => {
    const user = await requireUser("contacts.view");
    const all = await findDuplicates(db, input, {}, input.excludeId);
    const visible = isCentral(user) ? all : await findDuplicates(db, input, contactScope(user), input.excludeId);
    const visibleIds = new Set(visible.map((v) => v.id));
    return {
      matches: visible.map(
        (m): DuplicateMatch => ({
          id: m.id, name: fullName(m), phone: m.phone, email: m.email, type: m.type, city: m.city?.name ?? null,
          stage: isCentral(user) ? (m.currentLead?.stage.name ?? null) : null,
          dealership: isCentral(user) ? (m.currentLead?.dealership?.name ?? null) : null,
          createdAt: m.createdAt.toISOString(), archived: m.isArchived,
        }),
      ),
      /** Matches that exist in YADEA records but outside this user's scope (no details disclosed). */
      hiddenMatchCount: all.filter((m) => !visibleIds.has(m.id)).length,
    };
  });
}

const createSchema = z.object({
  contact: contactSchema,
  lead: leadDetailsSchema.extend({ createLead: z.boolean().default(true) }),
  /** "new" = create a contact; "attach" = add the lead to an existing matching contact */
  mode: z.enum(["new", "attach"]).default("new"),
  attachToContactId: z.string().optional(),
  confirmDuplicate: z.boolean().default(false),
  /** Portal: dealership the walk-in belongs to, and optional rep */
  dealershipId: z.string().optional(),
  assignedUserId: z.string().optional().nullable(),
});

export async function createContactAction(input: z.input<typeof createSchema>) {
  return runAction(async () => {
    const user = await requireUser("contacts.create");
    const v = createSchema.parse(input);
    const central = isCentral(user);

    let walkInDealershipId: string | null = null;
    if (!central) {
      walkInDealershipId = v.dealershipId ?? dealershipIds(user)[0] ?? null;
      if (!walkInDealershipId || !dealershipIds(user).includes(walkInDealershipId)) throw forbidden();
    }

    // Duplicate protection — never merge silently.
    const dups = await findDuplicates(db, { phone: v.contact.phone, email: v.contact.email });
    if (v.mode === "new" && dups.length && !v.confirmDuplicate) {
      throw new AppError("Possible duplicate found. Review the matching records before continuing.", "CONFLICT");
    }
    if (v.mode === "attach") {
      if (!v.attachToContactId || !dups.some((d) => d.id === v.attachToContactId)) throw new AppError("Choose one of the matching records.");
    }

    const result = await db.$transaction(async (tx) => {
      let contactId: string;
      if (v.mode === "attach") {
        contactId = v.attachToContactId!;
      } else {
        const n = await normalizedContactFields(tx, { phone: v.contact.phone, email: v.contact.email });
        const c = await tx.contact.create({
          data: {
            ...v.contact,
            ...n,
            communicationPrefs: v.contact.communicationPrefs as Prisma.InputJsonValue,
            customFields: v.contact.customFields as Prisma.InputJsonValue,
            consentRecordedAt: v.contact.consentMarketing ? new Date() : null,
            ownerId: central ? (v.contact.ownerId ?? user.id) : null,
            createdById: user.id,
            lastActivityAt: new Date(),
          },
        });
        contactId = c.id;
      }

      let leadId: string | null = null;
      if (v.lead.createLead || !central) {
        const lead = await createLead(tx, {
          contactId,
          origin: central ? "COMPANY" : "DEALERSHIP_WALK_IN",
          originDealershipId: walkInDealershipId,
          inquiryType: central ? v.lead.inquiryType : "WALK_IN",
          inquiryCategory: v.lead.inquiryCategory,
          description: v.lead.description,
          sourceId: v.contact.sourceId,
          cityId: v.contact.cityId,
          interestedModelId: v.lead.interestedModelId,
          preferredDealershipId: v.lead.preferredDealershipId ?? walkInDealershipId,
          campaign: v.lead.campaign,
          referralDetails: v.lead.referralDetails,
          nextFollowUpAt: v.lead.nextFollowUpAt,
          createdById: user.id,
          ownerId: central ? (v.contact.ownerId ?? user.id) : null,
        });
        leadId = lead.id;
        if (walkInDealershipId) {
          // Walk-ins belong to the creating dealership; reps own their walk-ins by default.
          const membership = user.memberships.find((m) => m.dealershipId === walkInDealershipId);
          const rep = v.assignedUserId !== undefined ? v.assignedUserId : membership?.role === "SALES_REP" ? user.id : null;
          await assignLead(tx, {
            leadId: lead.id, dealershipId: walkInDealershipId, userId: rep ?? null, type: "MANUAL",
            reason: "Dealership walk-in lead", assignedById: user.id,
          }).catch(async (e) => {
            // A dealership that is not yet accepting company leads can still record its own walk-ins.
            if (e instanceof AppError && e.code === "CONFLICT") {
              await tx.lead.update({ where: { id: lead.id }, data: { dealershipId: walkInDealershipId, assignedUserId: rep ?? null, assignedAt: new Date() } });
              await tx.leadAssignmentHistory.create({ data: { leadId: lead.id, toDealershipId: walkInDealershipId, toUserId: rep ?? null, type: "MANUAL", reason: "Dealership walk-in lead", assignedById: user.id } });
            } else throw e;
          });
        }
      }
      await audit({ userId: user.id, action: v.mode === "attach" ? "lead.created_on_existing_contact" : "contact.created", entityType: "Contact", entityId: contactId, changes: { duplicateConfirmed: v.confirmDuplicate, leadId } }, tx);
      return { contactId, leadId };
    });
    return { ok: true as const, data: result, message: v.mode === "attach" ? "Lead added to the existing contact." : "Contact created." };
  });
}

export async function updateContactAction(contactId: string, input: ContactInput, opts: { confirmDuplicate?: boolean } = {}) {
  return runAction(async () => {
    const user = await requireUser("contacts.edit");
    const before = await accessibleContact(user, contactId);
    const v = contactSchema.parse(input);
    const dups = await findDuplicates(db, { phone: v.phone, email: v.email }, {}, contactId);
    if (dups.length && !opts.confirmDuplicate && (v.phone !== before.phone || v.email !== before.email)) {
      throw new AppError("Another contact already uses this phone or email. Confirm to save anyway.", "CONFLICT");
    }
    const n = await normalizedContactFields(db, { phone: v.phone, email: v.email });
    const data = {
      ...v,
      ...n,
      communicationPrefs: v.communicationPrefs as Prisma.InputJsonValue,
      customFields: v.customFields as Prisma.InputJsonValue,
      consentRecordedAt: v.consentMarketing && !before.consentMarketing ? new Date() : before.consentRecordedAt,
      // Portal users can't reassign central ownership
      ownerId: isCentral(user) ? (v.ownerId ?? before.ownerId) : before.ownerId,
    };
    await db.$transaction(async (tx) => {
      await tx.contact.update({ where: { id: contactId }, data });
      const changes = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      await audit({ userId: user.id, action: "contact.updated", entityType: "Contact", entityId: contactId, changes }, tx);
      if (v.sourceId !== before.sourceId) {
        await logActivity(tx, { type: "SOURCE_CHANGED", title: "Contact source changed", contactId, userId: user.id, dealershipId: isCentral(user) ? null : dealershipIds(user)[0], metadata: { from: before.sourceId, to: v.sourceId } });
      } else {
        await logActivity(tx, { type: "CONTACT_UPDATED", title: "Contact details updated", contactId, userId: user.id, dealershipId: isCentral(user) ? null : dealershipIds(user)[0] });
      }
    });
    return { ok: true as const, message: "Contact saved." };
  });
}

export async function setArchivedAction(contactId: string, archived: boolean) {
  return runAction(async () => {
    const user = await requireUser("contacts.archive");
    await accessibleContact(user, contactId);
    await db.contact.update({ where: { id: contactId }, data: { isArchived: archived, archivedAt: archived ? new Date() : null } });
    await db.lead.updateMany({ where: { contactId }, data: { isArchived: archived } });
    await audit({ userId: user.id, action: archived ? "contact.archived" : "contact.restored", entityType: "Contact", entityId: contactId });
    return { ok: true as const, message: archived ? "Contact archived." : "Contact restored." };
  });
}

export async function uploadAvatarAction(contactId: string, formData: FormData) {
  return runAction(async () => {
    const user = await requireUser("contacts.edit");
    await accessibleContact(user, contactId);
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("Choose an image.");
    const stored = await saveUpload(file, { kind: "image", uploadedById: user.id, folder: "avatars" });
    await db.contact.update({ where: { id: contactId }, data: { avatarFileId: stored.id } });
    await audit({ userId: user.id, action: "contact.avatar_updated", entityType: "Contact", entityId: contactId });
    return { ok: true as const, message: "Picture updated." };
  });
}

/** Change a lead's source manually. The original attribution stays on lead.originalSourceId and in the audit log. */
export async function changeLeadSourceAction(leadId: string, sourceId: string) {
  return runAction(async () => {
    const user = await requireUser("contacts.edit");
    const lead = await accessibleLead(user, leadId);
    const src = await db.leadSource.findFirstOrThrow({ where: { id: sourceId, isActive: true } });
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { sourceId: src.id, originalSourceId: lead.originalSourceId ?? lead.sourceId } });
      await logActivity(tx, { type: "SOURCE_CHANGED", title: `Source changed to ${src.name}`, contactId: lead.contactId, leadId, userId: user.id, dealershipId: lead.dealershipId, metadata: { from: lead.sourceId, to: src.id } });
      await audit({ userId: user.id, action: "lead.source_changed", entityType: "Lead", entityId: leadId, changes: { sourceId: { from: lead.sourceId, to: src.id } } }, tx);
    });
    return { ok: true as const, message: "Source updated. Original attribution preserved." };
  });
}
