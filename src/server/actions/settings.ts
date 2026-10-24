"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { saveSettings, type SystemSettings } from "@/server/settings";
import { runScheduledJobs } from "@/server/services/jobs";

const name = z.string().trim().min(1).max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// ───────── Pipeline stages ─────────

export async function saveStageAction(id: string | null, input: { name: string; color: string; kind: "OPEN" | "WON" | "LOST"; isActive: boolean; isDefault: boolean; notifyOnEnter: boolean }) {
  return runAction(async () => {
    const user = await requireUser("pipeline.configure");
    const v = z.object({ name, color, kind: z.enum(["OPEN", "WON", "LOST"]), isActive: z.boolean(), isDefault: z.boolean(), notifyOnEnter: z.boolean() }).parse(input);
    if (v.isDefault && (v.kind !== "OPEN" || !v.isActive)) throw new AppError("The default stage must be an active open stage.");
    await db.$transaction(async (tx) => {
      if (v.isDefault) await tx.leadStage.updateMany({ data: { isDefault: false } });
      if (id) {
        const before = await tx.leadStage.findUnique({ where: { id } });
        if (!before) throw notFound();
        if (before.kind !== v.kind && (await tx.lead.count({ where: { stageId: id } }))) throw new AppError("Can't change the type of a stage that has leads.");
        await tx.leadStage.update({ where: { id }, data: v });
      } else {
        const max = await tx.leadStage.aggregate({ _max: { sortOrder: true } });
        const key = v.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40) + "_" + Date.now().toString(36).toUpperCase();
        await tx.leadStage.create({ data: { ...v, key, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
      }
      // Invariants: at least one active default, one active WON and one active LOST stage.
      const active = await tx.leadStage.findMany({ where: { isActive: true } });
      if (!active.some((s) => s.kind === "WON")) throw new AppError("Keep at least one active Converted (won) stage.");
      if (!active.some((s) => s.kind === "LOST")) throw new AppError("Keep at least one active Lost stage.");
      if (!active.some((s) => s.isDefault)) throw new AppError("One active open stage must be the default for new leads.");
      await audit({ userId: user.id, action: id ? "stage.updated" : "stage.created", entityType: "LeadStage", entityId: id, changes: v }, tx);
    });
    return { ok: true as const, message: "Stage saved." };
  });
}

export async function moveStageAction(id: string, dir: -1 | 1) {
  return runAction(async () => {
    await requireUser("pipeline.configure");
    const stages = await db.leadStage.findMany({ orderBy: { sortOrder: "asc" } });
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return { ok: true as const };
    const [a, b] = [stages[i]!, stages[j]!];
    await db.$transaction(async (tx) => {
      await tx.leadStage.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } });
      await tx.leadStage.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } });
    });
    return { ok: true as const };
  });
}

// ───────── Simple lists: loss reasons, sources ─────────

export async function saveLossReasonAction(id: string | null, input: { name: string; isActive: boolean }) {
  return runAction(async () => {
    const user = await requireUser("pipeline.configure");
    const v = z.object({ name, isActive: z.boolean() }).parse(input);
    if (id) await db.lossReason.update({ where: { id }, data: v });
    else {
      const max = await db.lossReason.aggregate({ _max: { sortOrder: true } });
      await db.lossReason.create({ data: { ...v, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    }
    await audit({ userId: user.id, action: "loss_reason.saved", entityType: "LossReason", entityId: id, changes: v });
    return { ok: true as const, message: "Loss reason saved." };
  });
}

/** Lead sources are a fixed list; administrators can rename or deactivate them. */
export async function saveSourceAction(id: string, input: { name: string; isActive: boolean }) {
  return runAction(async () => {
    const user = await requireUser("pipeline.configure");
    const v = z.object({ name, isActive: z.boolean() }).parse(input);
    await db.leadSource.update({ where: { id }, data: v });
    await audit({ userId: user.id, action: "source.saved", entityType: "LeadSource", entityId: id, changes: v });
    return { ok: true as const, message: "Source saved." };
  });
}

// ───────── Locations ─────────

export async function saveProvinceAction(id: string | null, input: { name: string; isActive: boolean }) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const v = z.object({ name, isActive: z.boolean() }).parse(input);
    const clash = await db.province.findFirst({ where: { name: v.name, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That province exists.");
    if (id) await db.province.update({ where: { id }, data: v });
    else await db.province.create({ data: v });
    await audit({ userId: user.id, action: "province.saved", entityType: "Province", entityId: id, changes: v });
    return { ok: true as const, message: "Province saved." };
  });
}

export async function saveCityAction(id: string | null, input: { name: string; provinceId: string; isActive: boolean; sortOrder: number }) {
  return runAction(async () => {
    const user = await requireUser("dealerships.manage");
    const v = z.object({ name, provinceId: z.string().min(1), isActive: z.boolean(), sortOrder: z.coerce.number().int().min(0).max(10000) }).parse(input);
    const clash = await db.city.findFirst({ where: { name: v.name, provinceId: v.provinceId, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That city already exists in this province.");
    // Deactivating a city hides it (and its outlets) from public forms; existing leads are untouched.
    if (id) await db.city.update({ where: { id }, data: v });
    else await db.city.create({ data: v });
    await audit({ userId: user.id, action: "city.saved", entityType: "City", entityId: id, changes: v });
    return { ok: true as const, message: "City saved." };
  });
}

// ───────── Custom fields ─────────

export async function saveCustomFieldAction(id: string | null, input: { entity: "CONTACT" | "LEAD"; key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX" | "TEXTAREA"; options: string[]; isActive: boolean }) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const v = z.object({
      entity: z.enum(["CONTACT", "LEAD"]), key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "lowercase_with_underscores"), label: name,
      type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX", "TEXTAREA"]), options: z.array(z.string().trim().min(1).max(80)).max(50), isActive: z.boolean(),
    }).parse(input);
    if (v.type === "SELECT" && !v.options.length) throw new AppError("Dropdown fields need options.");
    const clash = await db.customFieldDefinition.findFirst({ where: { entity: v.entity, key: v.key, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That key is in use.", "CONFLICT", { key: "In use" });
    if (id) await db.customFieldDefinition.update({ where: { id }, data: { label: v.label, type: v.type, options: v.options, isActive: v.isActive } });
    else await db.customFieldDefinition.create({ data: v });
    await audit({ userId: user.id, action: "custom_field.saved", entityType: "CustomFieldDefinition", entityId: id, changes: v });
    return { ok: true as const, message: "Custom field saved." };
  });
}

// ───────── System settings ─────────

export async function saveSystemSettingsAction(patch: Partial<SystemSettings>) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const v = z.object({
      privacyPolicyUrl: z.string().trim().min(1).max(300).optional(),
      consentText: z.string().trim().min(10).max(1000).optional(),
      defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
      duplicateMatching: z.object({ byPhone: z.boolean(), byEmail: z.boolean() }).optional(),
      notifications: z.object({ emailEnabled: z.boolean(), upcomingTestDriveHours: z.coerce.number().int().min(1).max(168) }).optional(),
      testDrive: z.object({ minLeadHours: z.coerce.number().min(0).max(72), maxDaysAhead: z.coerce.number().int().min(1).max(365) }).optional(),
      gamification: z.object({ enabled: z.boolean(), responseWindowHours: z.coerce.number().min(0.25).max(72), points: z.record(z.string(), z.coerce.number().int().min(0).max(1000)) }).optional(),
      applicationOptions: z.object({ salutations: z.array(z.string()), propertyOwnership: z.array(z.string()), businessStructure: z.array(z.string()) }).optional(),
    }).parse(patch);
    await saveSettings(v as Partial<SystemSettings>);
    await audit({ userId: user.id, action: "settings.updated", entityType: "Setting", entityId: "system", changes: v });
    return { ok: true as const, message: "Settings saved." };
  });
}

// ───────── Gamification ─────────

export async function saveAchievementAction(id: string, input: { name: string; description: string; isActive: boolean; count?: number; totalPoints?: number }) {
  return runAction(async () => {
    const user = await requireUser("gamification.manage");
    const a = await db.achievement.findUnique({ where: { id } });
    if (!a) throw notFound();
    const v = z.object({ name, description: z.string().trim().min(3).max(200), isActive: z.boolean(), count: z.coerce.number().int().min(1).max(10000).optional(), totalPoints: z.coerce.number().int().min(1).max(1_000_000).optional() }).parse(input);
    const c = a.criteria as { eventType?: string; count?: number; totalPoints?: number };
    await db.achievement.update({ where: { id }, data: { name: v.name, description: v.description, isActive: v.isActive, criteria: c.eventType ? { eventType: c.eventType, count: v.count ?? c.count } : { totalPoints: v.totalPoints ?? c.totalPoints } } });
    await audit({ userId: user.id, action: "achievement.updated", entityType: "Achievement", entityId: id, changes: v });
    return { ok: true as const, message: "Achievement saved." };
  });
}

export async function saveGoalAction(input: { name: string; metric: string; targetValue: number; dealershipId: string | null; startsAt: string; endsAt: string }) {
  return runAction(async () => {
    const user = await requireUser("gamification.manage");
    const v = z.object({
      name, metric: z.enum(["RESPONSE_TIME_HOURS", "FOLLOW_UP_COMPLETION_RATE", "TEST_DRIVES_COMPLETED", "CONVERSIONS", "SALES_REVENUE"]),
      targetValue: z.coerce.number().positive(), dealershipId: z.string().nullable(), startsAt: z.coerce.date(), endsAt: z.coerce.date(),
    }).parse(input);
    if (v.endsAt <= v.startsAt) throw new AppError("End date must be after the start date.");
    const ids = v.dealershipId ? [v.dealershipId] : (await db.dealership.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map((d) => d.id);
    await db.goal.createMany({ data: ids.map((dealershipId) => ({ name: v.name, metric: v.metric, targetValue: v.targetValue, dealershipId, startsAt: v.startsAt, endsAt: v.endsAt })) });
    await audit({ userId: user.id, action: "goal.created", entityType: "Goal", changes: { ...v, dealerships: ids.length } });
    return { ok: true as const, message: `Goal created for ${ids.length} dealership(s).` };
  });
}

export async function deleteGoalAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("gamification.manage");
    await db.goal.delete({ where: { id } });
    await audit({ userId: user.id, action: "goal.deleted", entityType: "Goal", entityId: id });
    return { ok: true as const, message: "Goal removed." };
  });
}

export async function runJobsNowAction() {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const r = await runScheduledJobs();
    await audit({ userId: user.id, action: "jobs.run_manually", entityType: "System", changes: r });
    return { ok: true as const, data: r, message: `Reminders: ${r.reminders} · overdue: ${r.overdue} · upcoming test drives: ${r.upcomingTestDrives} · emails sent ${r.email.sent}, skipped ${r.email.skipped}, failed ${r.email.failed}` };
  });
}
