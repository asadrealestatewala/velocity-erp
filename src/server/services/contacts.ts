import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/utils";

type MatchRules = { byPhone: boolean; byEmail: boolean };

async function rules(tx: Tx): Promise<MatchRules & { cc: string }> {
  const row = await tx.setting.findUnique({ where: { key: "system" } });
  const v = (row?.value ?? {}) as { duplicateMatching?: Partial<MatchRules>; defaultCountryCode?: string };
  return { byPhone: v.duplicateMatching?.byPhone ?? true, byEmail: v.duplicateMatching?.byEmail ?? true, cc: v.defaultCountryCode ?? "92" };
}

/** Potential duplicates by normalised phone / email (per configured rules). */
export async function findDuplicates(
  tx: Tx,
  input: { phone?: string | null; email?: string | null },
  scope: Prisma.ContactWhereInput = {},
  excludeId?: string,
) {
  const r = await rules(tx);
  const phone = r.byPhone ? normalizePhone(input.phone, r.cc) : null;
  const email = r.byEmail ? normalizeEmail(input.email) : null;
  const or: Prisma.ContactWhereInput[] = [];
  if (phone) or.push({ phoneNormalized: phone });
  if (email) or.push({ emailNormalized: email });
  if (!or.length) return [];
  return tx.contact.findMany({
    where: { AND: [scope, { OR: or }], ...(excludeId ? { id: { not: excludeId } } : {}) },
    take: 10,
    orderBy: { createdAt: "asc" },
    select: {
      id: true, firstName: true, lastName: true, phone: true, email: true, type: true, createdAt: true, isArchived: true,
      city: { select: { name: true } },
      currentLead: { select: { stage: { select: { name: true } }, dealership: { select: { name: true } } } },
    },
  });
}

export async function normalizedContactFields(tx: Tx, input: { phone?: string | null; email?: string | null }) {
  const r = await rules(tx);
  return { phoneNormalized: normalizePhone(input.phone, r.cc), emailNormalized: normalizeEmail(input.email) };
}

/**
 * Used by public form processing: reuse an existing contact when phone or email matches
 * (phone first). Existing data is never overwritten — only blank fields are filled in.
 */
export async function matchOrCreateContact(
  tx: Tx,
  input: {
    firstName: string;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    cityId?: string | null;
    provinceId?: string | null;
    sourceId?: string | null;
    businessName?: string | null;
    address?: string | null;
    salutation?: string | null;
    consentMarketing?: boolean;
    preferredContactMethod?: string | null;
  },
) {
  const r = await rules(tx);
  const phoneN = normalizePhone(input.phone, r.cc);
  const emailN = normalizeEmail(input.email);
  let existing = null;
  if (r.byPhone && phoneN) existing = await tx.contact.findFirst({ where: { phoneNormalized: phoneN }, orderBy: { createdAt: "asc" } });
  if (!existing && r.byEmail && emailN) existing = await tx.contact.findFirst({ where: { emailNormalized: emailN }, orderBy: { createdAt: "asc" } });

  if (existing) {
    const fill: Prisma.ContactUncheckedUpdateInput = {};
    if (!existing.lastName && input.lastName) fill.lastName = input.lastName;
    if (!existing.email && input.email) { fill.email = input.email; fill.emailNormalized = emailN; }
    if (!existing.phone && input.phone) { fill.phone = input.phone; fill.phoneNormalized = phoneN; }
    if (!existing.cityId && input.cityId) fill.cityId = input.cityId;
    if (!existing.provinceId && input.provinceId) fill.provinceId = input.provinceId;
    if (!existing.businessName && input.businessName) fill.businessName = input.businessName;
    if (!existing.address && input.address) fill.address = input.address;
    if (!existing.preferredContactMethod && input.preferredContactMethod) fill.preferredContactMethod = input.preferredContactMethod;
    if (input.consentMarketing) { fill.consentMarketing = true; fill.consentRecordedAt = new Date(); }
    if (existing.isArchived) { fill.isArchived = false; fill.archivedAt = null; }
    const contact = Object.keys(fill).length ? await tx.contact.update({ where: { id: existing.id }, data: fill }) : existing;
    return { contact, matched: true };
  }

  const contact = await tx.contact.create({
    data: {
      type: "LEAD",
      salutation: input.salutation ?? null,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      phoneNormalized: phoneN,
      email: input.email ?? null,
      emailNormalized: emailN,
      cityId: input.cityId ?? null,
      provinceId: input.provinceId ?? null,
      sourceId: input.sourceId ?? null,
      businessName: input.businessName ?? null,
      address: input.address ?? null,
      preferredContactMethod: input.preferredContactMethod ?? null,
      consentMarketing: input.consentMarketing ?? false,
      consentRecordedAt: input.consentMarketing ? new Date() : null,
      lastActivityAt: new Date(),
    },
  });
  return { contact, matched: false };
}
