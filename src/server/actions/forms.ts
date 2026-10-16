"use server";
import { z } from "zod";
import type { Prisma, FormType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { saveUpload } from "@/server/storage";
import { CRM_MAPPINGS, FIELD_TYPES, OPTION_SOURCES, type FormField, type FormSettings } from "@/lib/forms/schema";
import { FORM_TEMPLATES } from "@/lib/forms/defaults";
import { slugify } from "@/lib/utils";

const fieldSchema = z.object({
  id: z.string().min(1).max(40),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Keys use lowercase letters, numbers and underscores"),
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, "Every field needs a label").max(200),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  required: z.boolean(),
  width: z.enum(["full", "half", "third"]),
  options: z.array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(120) })).max(200).optional(),
  optionsSource: z.enum(OPTION_SOURCES).nullable().optional(),
  dependsOn: z.string().max(40).optional(),
  validation: z
    .object({ minLength: z.number().int().min(0).optional(), maxLength: z.number().int().min(1).max(10000).optional(), min: z.number().optional(), max: z.number().optional(), pattern: z.string().max(300).optional(), patternMessage: z.string().max(200).optional() })
    .optional(),
  conditional: z.object({ field: z.string().max(40), op: z.enum(["equals", "notEquals", "notEmpty", "empty"]), value: z.string().max(200).optional() }).nullable().optional(),
  mapTo: z.enum(Object.keys(CRM_MAPPINGS) as [keyof typeof CRM_MAPPINGS]).nullable().optional(),
  accept: z.enum(["image", "document"]).optional(),
  maxFiles: z.number().int().min(1).max(10).optional(),
});

const settingsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().max(300).optional(),
  headerImageUrl: z.string().max(300).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  submitLabel: z.string().trim().min(1).max(40),
  successTitle: z.string().trim().min(1).max(120),
  successMessage: z.string().trim().min(1).max(1000),
  privacyPolicyUrl: z.string().max(300).optional(),
  consentText: z.string().max(1000).optional(),
  routing: z.enum(["SELECTED_OUTLET", "CITY_AUTO", "MANUAL"]),
  sourceKey: z.string().min(1).max(40),
  allowCityFallback: z.boolean().optional(),
  cardTitle: z.string().max(120).optional(),
});

/** Structural checks that keep a schema processable (unique keys, mapped essentials per form type). */
function checkSchema(type: FormType, fields: FormField[], forPublish: boolean) {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) errors.push(`Duplicate field key "${f.key}"`);
    keys.add(f.key);
    if ((f.type === "select" || f.type === "radio" || f.type === "checkboxes") && !f.optionsSource && !(f.options?.length)) errors.push(`"${f.label}" needs at least one option`);
    if (f.conditional?.field && !fields.some((x) => x.key === f.conditional!.field)) errors.push(`"${f.label}" depends on a missing field`);
    if (f.optionsSource === "outlets" && !(f.dependsOn && fields.some((x) => x.key === f.dependsOn && x.optionsSource === "cities"))) errors.push(`"${f.label}" (outlets) must depend on a City field`);
  }
  const mapped = new Set(fields.map((f) => f.mapTo).filter(Boolean));
  const dupMaps = fields.filter((f) => f.mapTo).map((f) => f.mapTo!);
  const seen = new Set<string>();
  for (const m of dupMaps) {
    if (seen.has(m)) errors.push(`Two fields map to "${CRM_MAPPINGS[m]}"`);
    seen.add(m);
  }
  if (forPublish) {
    const need: Record<FormType, (keyof typeof CRM_MAPPINGS)[]> = {
      TEST_DRIVE: ["firstName", "phone", "city", "outlet", "bikeModel", "testDriveDate", "consent"],
      GENERAL_INQUIRY: ["firstName", "phone"],
      DEALERSHIP_APPLICATION: ["firstName", "lastName", "email", "phone", "businessName", "businessAddress", "yearsInBusiness", "consent"],
      CUSTOM: ["firstName"],
    };
    for (const m of need[type]) if (!mapped.has(m)) errors.push(`A field must be mapped to "${CRM_MAPPINGS[m]}"`);
    if (!fields.some((f) => f.mapTo === "phone" || f.mapTo === "email")) errors.push("Map at least a phone or email field so contacts can be matched");
  }
  if (errors.length) throw new AppError(errors.slice(0, 6).join(" · "));
}

export async function createFormAction(input: { name: string; slug?: string; type: FormType; template?: boolean }) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    const v = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().max(60).optional(), type: z.enum(["TEST_DRIVE", "GENERAL_INQUIRY", "DEALERSHIP_APPLICATION", "CUSTOM"]), template: z.boolean().default(true) }).parse(input);
    const slug = slugify(v.slug || v.name);
    if (!slug) throw new AppError("Choose a URL slug.", "VALIDATION", { slug: "Required" });
    if (await db.form.findUnique({ where: { slug } })) throw new AppError("That URL is already in use.", "CONFLICT", { slug: "Already in use" });
    const tpl = v.type !== "CUSTOM" && v.template ? FORM_TEMPLATES[v.type] : null;
    const fields: FormField[] = tpl?.fields ?? [
      { id: "first_name", key: "first_name", type: "text", label: "First Name", required: true, width: "half", mapTo: "firstName" },
      { id: "last_name", key: "last_name", type: "text", label: "Last Name", required: false, width: "half", mapTo: "lastName" },
      { id: "phone", key: "phone", type: "phone", label: "Phone", required: true, width: "half", mapTo: "phone" },
      { id: "email", key: "email", type: "email", label: "Email", required: false, width: "half", mapTo: "email" },
      { id: "consent", key: "consent", type: "consent", label: "Privacy consent", required: true, width: "full", mapTo: "consent" },
    ];
    const settings: FormSettings = tpl?.settings ?? {
      title: v.name, subtitle: "", primaryColor: "#EF6C1A", submitLabel: "Submit", successTitle: "Thank you!", successMessage: "We received your submission and will be in touch.",
      routing: "CITY_AUTO", sourceKey: "WEBSITE", allowCityFallback: true, cardTitle: v.name,
    };
    const form = await db.form.create({
      data: { name: v.name, slug, type: v.type, status: "DRAFT", draftSchema: { fields } as unknown as Prisma.InputJsonValue, draftSettings: settings as unknown as Prisma.InputJsonValue, createdById: user.id },
    });
    await audit({ userId: user.id, action: "form.created", entityType: "Form", entityId: form.id });
    return { ok: true as const, data: { id: form.id }, message: "Form created." };
  });
}

export async function saveFormDraftAction(formId: string, input: { name: string; description?: string; fields: FormField[]; settings: FormSettings }) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    const form = await db.form.findUnique({ where: { id: formId } });
    if (!form) throw notFound();
    const fields = z.array(fieldSchema).max(60).parse(input.fields) as FormField[];
    const settings = settingsSchema.parse(input.settings) as FormSettings;
    checkSchema(form.type, fields, false);
    await db.form.update({
      where: { id: formId },
      data: { name: z.string().trim().min(2).max(120).parse(input.name), description: input.description?.slice(0, 500) ?? null, draftSchema: { fields } as unknown as Prisma.InputJsonValue, draftSettings: settings as unknown as Prisma.InputJsonValue },
    });
    return { ok: true as const, message: "Draft saved." };
  });
}

/** Publishing snapshots the draft into an immutable FormVersion; submissions record which version they used. */
export async function publishFormAction(formId: string) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    const form = await db.form.findUnique({ where: { id: formId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!form) throw notFound();
    const fields = (form.draftSchema as { fields: FormField[] }).fields;
    checkSchema(form.type, fields, true);
    const nextVersion = (form.versions[0]?.version ?? 0) + 1;
    const v = await db.$transaction(async (tx) => {
      const ver = await tx.formVersion.create({ data: { formId, version: nextVersion, schema: form.draftSchema as Prisma.InputJsonValue, settings: form.draftSettings as Prisma.InputJsonValue, publishedById: user.id } });
      await tx.form.update({ where: { id: formId }, data: { status: "PUBLISHED", publishedVersionId: ver.id } });
      await audit({ userId: user.id, action: "form.published", entityType: "Form", entityId: formId, changes: { version: nextVersion } }, tx);
      return ver;
    });
    return { ok: true as const, message: `Published version ${v.version}.` };
  });
}

export async function unpublishFormAction(formId: string) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    await db.form.update({ where: { id: formId }, data: { status: "UNPUBLISHED" } });
    await audit({ userId: user.id, action: "form.unpublished", entityType: "Form", entityId: formId });
    return { ok: true as const, message: "Form unpublished — it no longer accepts submissions." };
  });
}

export async function duplicateFormAction(formId: string) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    const form = await db.form.findUnique({ where: { id: formId } });
    if (!form) throw notFound();
    let slug = `${form.slug}-copy`;
    for (let i = 2; await db.form.findUnique({ where: { slug } }); i++) slug = `${form.slug}-copy-${i}`;
    const copy = await db.form.create({
      data: { name: `${form.name} (copy)`, slug, type: form.type, status: "DRAFT", description: form.description, draftSchema: form.draftSchema as Prisma.InputJsonValue, draftSettings: form.draftSettings as Prisma.InputJsonValue, createdById: user.id },
    });
    await audit({ userId: user.id, action: "form.duplicated", entityType: "Form", entityId: copy.id, changes: { from: formId } });
    return { ok: true as const, data: { id: copy.id }, message: "Form duplicated as a draft." };
  });
}

export async function uploadFormHeaderAction(formId: string, fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("forms.manage");
    const file = fd.get("file");
    if (!(file instanceof File)) throw new AppError("Choose an image.");
    if (!(await db.form.findUnique({ where: { id: formId } }))) throw notFound();
    const stored = await saveUpload(file, { kind: "image", uploadedById: user.id, isPublic: true, folder: "forms" });
    return { ok: true as const, data: { url: `/api/files/${stored.id}` }, message: "Image uploaded — save the draft to keep it." };
  });
}
