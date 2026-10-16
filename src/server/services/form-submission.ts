import "server-only";
import { Prisma, type InquiryType } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import {
  fieldByMapping,
  validateValues,
  type CrmMapping,
  type FormField,
  type FormSettings,
  type SubmittedValues,
} from "@/lib/forms/schema";
import { normalizePhone } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { putUpload } from "@/server/storage";
import { logActivity } from "./activity";
import { assignLead, pickDealershipForCity, validateOutletSelection } from "./assignment";
import { matchOrCreateContact } from "./contacts";
import { createLead } from "./leads";
import { centralUserIdsWith, dealershipUserIds, deliverOutbox, notify } from "./notifications";
import { validateBookingSlot, scheduleAt } from "./test-drives";

export type SubmitInput = {
  slug: string;
  raw: Record<string, string | string[] | undefined>;
  files: Record<string, File[]>;
  idempotencyKey: string;
  meta: { ipHash?: string | null; userAgent?: string | null; referrer?: string | null; utm?: Record<string, string> };
  /** Set by spam heuristics: stored as SPAM, no CRM records created, visitor still sees success. */
  spam?: boolean;
};

export type SubmitResult =
  | { ok: true; submissionNumber: number; successTitle: string; successMessage: string; duplicate?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type LogEntry = { at: string; step: string; detail?: string };

const UTM_SOURCE_MAP: Record<string, string> = {
  facebook: "FACEBOOK", fb: "FACEBOOK", instagram: "INSTAGRAM", ig: "INSTAGRAM", tiktok: "TIKTOK",
  google: "GOOGLE", whatsapp: "WHATSAPP", sms: "SMS", email: "EMAIL", newsletter: "EMAIL", referral: "REFERRAL", event: "EVENT",
};

const INQUIRY_TYPE: Record<string, InquiryType> = {
  TEST_DRIVE: "TEST_DRIVE",
  GENERAL_INQUIRY: "GENERAL_INQUIRY",
  CUSTOM: "OTHER",
};

/**
 * The public form submission pipeline:
 *  1 resolve published form/version → 2 validate fields → 3 consent → 4 city/outlet/model →
 *  5 duplicate + idempotency → 6 submission → 7 contact → 8 lead → 9 assignment →
 *  10 history → 11 notifications → 12 commit → 13 safe response.
 */
export async function processSubmission(input: SubmitInput): Promise<SubmitResult> {
  // 1. Published form + active version
  const form = await db.form.findUnique({ where: { slug: input.slug }, include: { publishedVersion: true } });
  if (!form || form.status !== "PUBLISHED" || !form.publishedVersion) {
    return { ok: false, error: "This form is not currently accepting submissions." };
  }
  const version = form.publishedVersion;
  const fields = (version.schema as { fields: FormField[] }).fields;
  const settings = version.settings as FormSettings;
  const sys = await getSettings();
  const success = (n: number, duplicate = false): SubmitResult => ({
    ok: true, submissionNumber: n, successTitle: settings.successTitle, successMessage: settings.successMessage, duplicate,
  });

  // 5a. Idempotency: the same rendered form instance can only create one submission.
  const prior = await db.formSubmission.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) return success(prior.number);

  // 2. Field validation against the published schema
  const fileCounts = Object.fromEntries(Object.entries(input.files).map(([k, v]) => [k, v.length]));
  const { values, errors } = validateValues(fields, input.raw, fileCounts);

  const get = (m: CrmMapping) => {
    const f = fieldByMapping(fields, m);
    return f ? values[f.key] : undefined;
  };
  const keyOf = (m: CrmMapping) => fieldByMapping(fields, m)?.key ?? m;
  const str = (m: CrmMapping) => {
    const v = get(m);
    return typeof v === "string" && v ? v : null;
  };

  // 3. Consent
  const consentField = fields.find((f) => f.type === "consent");
  const consentGiven = consentField ? values[consentField.key] === true : false;
  if (consentField?.required && !consentGiven) errors[consentField.key] = "You must accept the privacy policy to continue";

  // 4. Dynamic option validation (server-enforced — never trust frontend filtering)
  const cityId = str("city");
  const provinceId = str("province");
  const outletId = str("outlet");
  const bikeModelId = str("bikeModel");

  const city = cityId ? await db.city.findFirst({ where: { id: cityId, isActive: true } }) : null;
  if (cityId && !city) errors[keyOf("city")] = "Please select a valid city";
  if (provinceId && !(await db.province.findFirst({ where: { id: provinceId, isActive: true } }))) errors[keyOf("province")] = "Please select a valid province";
  if (city && provinceId && city.provinceId !== provinceId) errors[keyOf("city")] = "The city does not belong to the selected province";

  const model = bikeModelId ? await db.bikeModel.findFirst({ where: { id: bikeModelId, isActive: true } }) : null;
  if (bikeModelId && !model) errors[keyOf("bikeModel")] = "Please select an available model";

  let outlet: { id: string; name: string } | null = null;
  if (outletId) {
    if (!city) errors[keyOf("outlet")] ??= "Select a city first";
    else {
      const check = await validateOutletSelection(db, { cityId: city.id, dealershipId: outletId, bikeModelId: model?.id });
      if (!check.ok) errors[keyOf("outlet")] = check.error;
      else outlet = check.dealership;
    }
  } else if (form.type === "TEST_DRIVE" && settings.routing === "SELECTED_OUTLET" && !errors[keyOf("outlet")]) {
    errors[keyOf("outlet")] = "Please select an outlet";
  }

  // Test-drive slot validation
  let testDriveAt: Date | null = null;
  const tdDate = str("testDriveDate");
  const tdTime = str("testDriveTime") ?? (tdDate ? "10:00" : null);
  if (tdDate && tdTime) {
    testDriveAt = scheduleAt(tdDate, tdTime);
    if (outlet && !errors[keyOf("testDriveDate")]) {
      const slot = await validateBookingSlot(db, { dealershipId: outlet.id, at: testDriveAt, settings: sys });
      if (!slot.ok) errors[slot.field === "time" ? keyOf("testDriveTime") : keyOf("testDriveDate")] = slot.error;
    }
  }

  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };

  // Source attribution
  const utm = input.meta.utm ?? {};
  const sourceKey = UTM_SOURCE_MAP[(utm.source ?? "").toLowerCase()] ?? settings.sourceKey ?? "WEBSITE";
  const source = await db.leadSource.findUnique({ where: { key: sourceKey } });

  // Upload files before the transaction (object storage is not transactional).
  const stored: { fieldKey: string; data: Awaited<ReturnType<typeof putUpload>> }[] = [];
  try {
    for (const f of fields.filter((x) => x.type === "file")) {
      for (const file of input.files[f.key] ?? []) {
        stored.push({ fieldKey: f.key, data: await putUpload(file, { kind: f.accept === "image" ? "image" : "document", folder: "submissions" }) });
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message || "File upload failed.", fieldErrors: {} };
  }

  const log: LogEntry[] = [];
  const step = (s: string, detail?: string) => log.push({ at: new Date().toISOString(), step: s, detail });

  try {
    const result = await db.$transaction(
      async (tx) => {
        const phoneN = normalizePhone(str("phone"), sys.defaultCountryCode);
        // 5b. Duplicate detection: same person, same form, last 24h
        const dup = phoneN || str("email")
          ? await tx.formSubmission.findFirst({
              where: {
                formId: form.id,
                createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
                status: { notIn: ["SPAM", "FAILED"] },
                isDuplicate: false,
                OR: [
                  ...(str("phone") ? [{ phone: str("phone")! }] : []),
                  ...(str("email") ? [{ email: { equals: str("email")!, mode: "insensitive" as const } }] : []),
                ],
              },
              orderBy: { createdAt: "desc" },
            })
          : null;

        // 6. Submission record
        const submission = await tx.formSubmission.create({
          data: {
            formId: form.id,
            formVersionId: version.id,
            status: input.spam ? "SPAM" : "NEW",
            data: values as Prisma.InputJsonValue,
            firstName: str("firstName"),
            lastName: str("lastName"),
            phone: str("phone"),
            email: str("email"),
            cityId: city?.id ?? null,
            dealershipId: outlet?.id ?? null,
            bikeModelId: model?.id ?? null,
            testDriveAt,
            sourceId: source?.id ?? null,
            consentGiven,
            consentText: consentField ? (settings.consentText || sys.consentText) : null,
            consentAt: consentGiven ? new Date() : null,
            privacyPolicyUrl: settings.privacyPolicyUrl || sys.privacyPolicyUrl,
            utm: utm as Prisma.InputJsonValue,
            referrer: input.meta.referrer?.slice(0, 500) ?? null,
            ipHash: input.meta.ipHash ?? null,
            userAgent: input.meta.userAgent ?? null,
            idempotencyKey: input.idempotencyKey,
            isDuplicate: !!dup,
            duplicateOfId: dup?.id ?? null,
          },
        });
        step("received", `Schema v${version.version}`);
        for (const s of stored) {
          const file = await tx.storedFile.create({ data: s.data });
          await tx.formSubmissionFile.create({ data: { submissionId: submission.id, fieldKey: s.fieldKey, fileId: file.id } });
        }
        if (stored.length) step("files_stored", `${stored.length} file(s)`);

        if (input.spam) {
          step("spam", "Blocked by spam heuristics; no CRM records created");
          await tx.formSubmission.update({ where: { id: submission.id }, data: { processingLog: log } });
          return { submission, duplicate: false };
        }

        if (form.type === "DEALERSHIP_APPLICATION") {
          await createApplicationFromSubmission(tx, submission.id, values, get, str, city?.id ?? null, provinceId, consentGiven, submission.consentText);
          step("application_created");
          await tx.formSubmission.update({ where: { id: submission.id }, data: { status: "PROCESSED", processingLog: log } });
          return { submission, duplicate: false };
        }

        // 7. Contact (match on normalised phone/email; never silently overwrite)
        const { contact, matched } = await matchOrCreateContact(tx, {
          firstName: str("firstName") ?? "Unknown",
          lastName: str("lastName"),
          phone: str("phone"),
          email: str("email"),
          cityId: city?.id ?? null,
          provinceId: city?.provinceId ?? provinceId,
          sourceId: source?.id ?? null,
          salutation: str("salutation"),
          preferredContactMethod: str("preferredContactMethod"),
          consentMarketing: consentGiven,
        });
        step(matched ? "contact_matched" : "contact_created", contact.id);

        await logActivity(tx, {
          type: "FORM_SUBMITTED",
          title: `Submitted "${form.name}"`,
          body: str("message"),
          contactId: contact.id,
          dealershipId: outlet?.id ?? null,
          metadata: { submissionId: submission.id, submissionNumber: submission.number, formId: form.id },
        });

        // Duplicate within 24h: attach to the existing lead instead of creating a new one.
        if (dup?.leadId) {
          await tx.formSubmission.update({
            where: { id: submission.id },
            data: { status: "DUPLICATE", contactId: contact.id, leadId: dup.leadId, processingLog: [...log, { at: new Date().toISOString(), step: "duplicate", detail: `Duplicate of #${dup.number}; linked to existing lead` }] },
          });
          return { submission, duplicate: true };
        }

        // 8. Lead
        const lead = await createLead(tx, {
          contactId: contact.id,
          origin: "COMPANY",
          inquiryType: INQUIRY_TYPE[form.type] ?? "OTHER",
          inquiryCategory: str("inquiryCategory"),
          description: str("message"),
          sourceId: source?.id ?? null,
          cityId: city?.id ?? null,
          interestedModelId: model?.id ?? null,
          preferredDealershipId: outlet?.id ?? null,
          campaign: utm.campaign ?? null,
          utm: { source: utm.source, medium: utm.medium, campaign: utm.campaign, term: utm.term, content: utm.content },
          sourceFormId: form.id,
        });
        step("lead_created", `#${lead.number}`);

        // 9. Assignment by routing policy
        let assignedTo: string | null = null;
        if (settings.routing === "SELECTED_OUTLET" && outlet) {
          assignedTo = outlet.id;
        } else if ((settings.routing === "CITY_AUTO" || (settings.routing === "SELECTED_OUTLET" && settings.allowCityFallback)) && city) {
          assignedTo = await pickDealershipForCity(tx, city.id, model?.id);
        }
        if (assignedTo) {
          await assignLead(tx, {
            leadId: lead.id,
            dealershipId: assignedTo,
            type: "AUTOMATIC",
            reason: settings.routing === "SELECTED_OUTLET" && outlet ? "Customer selected this outlet" : `City routing (${city?.name})`,
            idempotencyKey: `submission:${submission.id}`,
          });
          step("assigned", assignedTo);
        } else {
          step("unassigned", "Queued for manual assignment");
          await notify(tx, {
            userIds: await centralUserIdsWith(tx, "leads.assign"),
            type: "LEAD_ASSIGNED",
            title: `Unassigned lead: ${contact.firstName} ${contact.lastName ?? ""}`.trim(),
            body: `${form.name} — ${city?.name ?? "no city"}. Needs manual assignment.`,
            link: { central: `/crm/contacts/${contact.id}` },
            entityType: "Lead",
            entityId: lead.id,
          });
        }

        // Test-drive booking
        if (form.type === "TEST_DRIVE" && outlet && model && testDriveAt && city) {
          const booking = await tx.testDriveBooking.create({
            data: {
              contactId: contact.id,
              leadId: lead.id,
              dealershipId: outlet.id,
              cityId: city.id,
              bikeModelId: model.id,
              scheduledAt: testDriveAt,
              status: "REQUESTED",
              customerNotes: str("message"),
              submissionId: submission.id,
            },
          });
          await logActivity(tx, {
            type: "TEST_DRIVE_SCHEDULED",
            title: `Test drive requested: ${model.name}`,
            body: `Requested for ${testDriveAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} at ${outlet.name}`,
            contactId: contact.id,
            leadId: lead.id,
            dealershipId: outlet.id,
            metadata: { bookingId: booking.id },
          });
          await notify(tx, {
            userIds: await dealershipUserIds(tx, outlet.id),
            type: "TEST_DRIVE_BOOKED",
            title: `Test drive request: ${model.name}`,
            body: `${contact.firstName} ${contact.lastName ?? ""} · ${testDriveAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
            link: { portal: `/portal/test-drives?focus=${booking.id}`, central: `/crm/test-drives?focus=${booking.id}` },
            entityType: "TestDriveBooking",
            entityId: booking.id,
          });
          step("test_drive_requested", `#${booking.number}`);
        }

        await tx.formSubmission.update({
          where: { id: submission.id },
          data: { status: "PROCESSED", contactId: contact.id, leadId: lead.id, processingLog: log },
        });
        return { submission, duplicate: false };
      },
      { timeout: 20000 },
    );

    // Deliver queued emails after commit (best-effort; the job runner retries).
    void deliverOutbox().catch(() => {});
    return success(result.submission.number, result.duplicate);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Concurrent duplicate of the same idempotency key
      const again = await db.formSubmission.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (again) return success(again.number);
    }
    console.error("[form submission failed]", input.slug, (e as Error).message);
    return { ok: false, error: "We could not process your submission. Please try again in a moment." };
  }
}

async function createApplicationFromSubmission(
  tx: Tx,
  submissionId: string,
  values: SubmittedValues,
  get: (m: CrmMapping) => unknown,
  str: (m: CrmMapping) => string | null,
  cityId: string | null,
  provinceId: string | null,
  consentGiven: boolean,
  consentText: string | null,
) {
  const oem = str("isOemDealer");
  const app = await tx.dealershipApplication.create({
    data: {
      salutation: str("salutation"),
      firstName: str("firstName") ?? "",
      lastName: str("lastName") ?? "",
      email: str("email") ?? "",
      phone: str("phone") ?? "",
      businessName: str("businessName") ?? "",
      businessAddress: str("businessAddress") ?? "",
      yearsInBusiness: Number(get("yearsInBusiness") ?? 0) || 0,
      isOemDealer: oem === "yes" ? true : oem === "no" ? false : null,
      provinceId,
      cityId,
      propertyOwnership: str("propertyOwnership"),
      businessStructure: str("businessStructure"),
      consentGiven,
      consentText,
      consentAt: consentGiven ? new Date() : null,
      submissionId,
    },
  });
  const files = await tx.formSubmissionFile.findMany({ where: { submissionId } });
  for (const f of files) {
    await tx.dealershipApplicationDocument.create({ data: { applicationId: app.id, fileId: f.fileId, category: "Submitted with application" } });
  }
  await tx.applicationStatusHistory.create({ data: { applicationId: app.id, toStatus: "SUBMITTED", note: "Submitted via public form" } });
  await notify(tx, {
    userIds: await centralUserIdsWith(tx, "applications.review"),
    type: "APPLICATION_STATUS",
    title: `New dealership application: ${app.businessName}`,
    body: `${app.firstName} ${app.lastName} · ${values ? "awaiting review" : ""}`,
    link: { central: `/crm/applications/${app.id}` },
    entityType: "DealershipApplication",
    entityId: app.id,
  });
  return app;
}
