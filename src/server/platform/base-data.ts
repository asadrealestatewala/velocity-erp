import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEALERSHIP_APPLICATION_FORM, GENERAL_INQUIRY_FORM, TEST_DRIVE_FORM } from "@/lib/forms/defaults";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { syncPermissionCatalog } from "@/server/permission-sync";

/** Starting configuration for a NEW workspace: no demo people, no demo leads — only the things the CRM needs to work. */
export const BASE_STAGES = [
  ["NEW", "New Lead", "#3b82f6", "OPEN"],
  ["CONTACT_ATTEMPTED", "Contact Attempted", "#8b5cf6", "OPEN"],
  ["CONTACTED", "Contacted", "#06b6d4", "OPEN"],
  ["QUALIFIED", "Qualified", "#14b8a6", "OPEN"],
  ["TEST_DRIVE_SCHEDULED", "Test Drive Scheduled", "#f59e0b", "OPEN"],
  ["TEST_DRIVE_COMPLETED", "Test Drive Completed", "#f97316", "OPEN"],
  ["NEGOTIATION", "Negotiation", "#ec4899", "OPEN"],
  ["CONVERTED", "Converted", "#16a34a", "WON"],
  ["LOST", "Lost", "#ef4444", "LOST"],
] as const;
const LOSS_REASONS = ["Price", "Model unavailable", "No response", "Competitor selected", "Purchase postponed", "Other"];
const SOURCES = ["Website", "Facebook", "Instagram", "TikTok", "Google", "Referral", "Phone Call", "Walk-in", "Email", "SMS", "WhatsApp", "Event", "Other"];
const ACHIEVEMENTS = [
  ["QUICK_RESPONDER", "Quick Responder", "Responded to 5 new leads within the response window", "zap", { eventType: "FAST_RESPONSE_BONUS", count: 5 }],
  ["FOLLOW_UP_CHAMPION", "Follow-up Champion", "Completed 10 follow-ups", "repeat", { eventType: "FOLLOW_UP_COMPLETED", count: 10 }],
  ["TEST_DRIVE_SPECIALIST", "Test Drive Specialist", "Completed 5 test drives", "bike", { eventType: "TEST_DRIVE_COMPLETED", count: 5 }],
  ["CONVERSION_ACHIEVER", "Conversion Achiever", "Converted 3 leads into customers", "trophy", { eventType: "LEAD_CONVERTED", count: 3 }],
  ["TEAM_PLAYER", "Team Player", "Earned 100 performance points", "users", { totalPoints: 100 }],
  ["CONSISTENCY_CHAMPION", "Consistency Champion", "Completed 10 tasks on time", "calendar-check", { eventType: "TASK_ON_TIME", count: 10 }],
] as const;

export type OwnerInput = { name: string; email: string; password: string };
export type BaseDataOptions = { companyName: string; countryCode?: string; owner: OwnerInput };

/** Idempotent for roles/permissions; refuses to run twice on a workspace that already has users. */
export async function seedBaseData(db: PrismaClient, opts: BaseDataOptions) {
  if ((await db.user.count()) > 0) throw new Error("This workspace already has users — base data was not applied.");

  await db.setting.upsert({
    where: { key: "system" },
    create: { key: "system", value: { ...DEFAULT_SETTINGS, companyName: opts.companyName, defaultCountryCode: opts.countryCode ?? "92" } as unknown as Prisma.InputJsonValue },
    update: {},
  });
  await syncPermissionCatalog(db);

  const owner = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const user = await db.user.create({
    data: { email: opts.owner.email.trim().toLowerCase(), name: opts.owner.name.trim(), passwordHash: await bcrypt.hash(opts.owner.password, 12), roleId: owner.id },
  });

  for (const [i, [key, name, color, kind]] of BASE_STAGES.entries()) {
    await db.leadStage.create({ data: { key, name, color, kind, sortOrder: (i + 1) * 10, isDefault: key === "NEW", notifyOnEnter: key === "CONVERTED" || key === "NEGOTIATION" } });
  }
  for (const [i, name] of LOSS_REASONS.entries()) await db.lossReason.create({ data: { name, sortOrder: i } });
  for (const [i, name] of SOURCES.entries()) await db.leadSource.create({ data: { key: name.toUpperCase().replace(/[^A-Z]+/g, "_"), name, sortOrder: i } });

  // Locations are ordinary editable data; Pakistan is the starting point and can be changed in Settings.
  const provinces: Record<string, string> = {};
  for (const [i, name] of ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory"].entries()) {
    provinces[name] = (await db.province.create({ data: { name, sortOrder: i + 1 } })).id;
  }
  const cities: [string, string][] = [
    ["Lahore", "Punjab"], ["Faisalabad", "Punjab"], ["Multan", "Punjab"], ["Rawalpindi", "Punjab"], ["Karachi", "Sindh"], ["Hyderabad", "Sindh"],
    ["Peshawar", "Khyber Pakhtunkhwa"], ["Quetta", "Balochistan"], ["Islamabad", "Islamabad Capital Territory"],
  ];
  for (const [i, [name, prov]] of cities.entries()) await db.city.create({ data: { name, provinceId: provinces[prov]!, sortOrder: i + 1 } });

  await db.customFieldDefinition.create({ data: { entity: "CONTACT", key: "preferred_color", label: "Preferred colour", type: "SELECT", options: ["Black", "White", "Red", "Blue", "Grey"], sortOrder: 1 } });
  await db.customFieldDefinition.create({ data: { entity: "CONTACT", key: "financing_interest", label: "Interested in financing", type: "CHECKBOX", sortOrder: 2 } });

  for (const [type, def] of [["TEST_DRIVE", TEST_DRIVE_FORM], ["GENERAL_INQUIRY", GENERAL_INQUIRY_FORM], ["DEALERSHIP_APPLICATION", DEALERSHIP_APPLICATION_FORM]] as const) {
    const form = await db.form.create({
      data: { slug: def.slug, name: def.name, type, status: "PUBLISHED", description: def.description, draftSchema: { fields: def.fields } as unknown as Prisma.InputJsonValue, draftSettings: def.settings as unknown as Prisma.InputJsonValue, createdById: user.id },
    });
    const v = await db.formVersion.create({ data: { formId: form.id, version: 1, schema: { fields: def.fields } as unknown as Prisma.InputJsonValue, settings: def.settings as unknown as Prisma.InputJsonValue, publishedById: user.id } });
    await db.form.update({ where: { id: form.id }, data: { publishedVersionId: v.id } });
  }
  for (const [key, name, description, icon, criteria] of ACHIEVEMENTS) await db.achievement.create({ data: { key, name, description, icon, criteria } });

  return { ownerId: user.id };
}
