import "server-only";
import { PrismaClient } from "@prisma/client";
import { platformDb } from "./client";
import { seedBaseData } from "./base-data";
import { applyMigrations, createSchema, dropSchema, listMigrations, schemaNameFor } from "./migrate";
import { emailHash, newToken, sha256 } from "./crypto";
import { ensureDefaultPlans } from "./plans";
import { getPlatformSettings } from "./settings";
import { changeSubscription, trialPatch } from "./subscriptions";
import { DEFAULT_SLUG, invalidateTenant, isReservedSlug, isValidSlug, tenantDbUrl } from "./tenants";
import { AppError } from "@/server/errors";

export type CreateWorkspaceInput = {
  slug: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  timezone?: string;
  currency?: string;
  countryCode?: string;
  /** Who is creating it — shown in the history/audit. */
  source: "SIGNUP" | "ADMIN";
  actor?: string | null;
};

export type CreatedWorkspace = { tenantId: string; slug: string; confirmToken: string; trial: boolean };

/**
 * Creates a company: platform record → its own schema → every CRM migration → base configuration → owner account → trial.
 * If any step fails the half-built schema and record are removed, so a failed signup leaves nothing behind.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<CreatedWorkspace> {
  const slug = input.slug.trim().toLowerCase();
  const email = input.ownerEmail.trim().toLowerCase();
  if (!isValidSlug(slug)) throw new AppError("Workspace code must be 3–40 characters: lowercase letters, numbers and single hyphens.", "VALIDATION", { slug: "Use 3–40 lowercase letters, numbers or hyphens." });
  if (isReservedSlug(slug) || slug === DEFAULT_SLUG) throw new AppError("That workspace code is reserved. Please choose another.", "VALIDATION", { slug: "That code is reserved." });
  const db = platformDb();
  if (await db.tenant.findUnique({ where: { slug } })) throw new AppError("That workspace code is already taken.", "CONFLICT", { slug: "Already taken." });

  const settings = await getPlatformSettings();
  await ensureDefaultPlans();
  const hash = emailHash(email);
  const priorTrial = settings.oneTrialPerOwner ? await db.trialClaim.findUnique({ where: { ownerEmailHash: hash } }) : null;
  const trialPlan = await db.plan.findUnique({ where: { key: settings.trialPlanKey } });
  const trial = !priorTrial && settings.trialDays > 0 && !!trialPlan?.trialEligible;

  const schema = schemaNameFor(slug);
  const token = newToken();
  const tenant = await db.tenant.create({
    data: {
      slug, name: input.companyName.trim(), status: "PROVISIONING", dbSchema: schema, ownerName: input.ownerName.trim(), ownerEmail: email, ownerEmailHash: hash,
      timezone: input.timezone ?? "Asia/Karachi", currency: input.currency ?? "PKR", countryCode: input.countryCode ?? "92",
      confirmTokenHash: sha256(token), confirmExpiresAt: new Date(Date.now() + 3 * 86_400_000), subStatus: "PENDING",
    },
  });

  let schemaCreated = false;
  let client: PrismaClient | null = null;
  try {
    await createSchema(schema);
    schemaCreated = true;
    await applyMigrations(schema);
    client = new PrismaClient({ datasourceUrl: tenantDbUrl(tenant) });
    await seedBaseData(client, { companyName: tenant.name, countryCode: tenant.countryCode, owner: { name: input.ownerName, email, password: input.ownerPassword } });
    await db.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE", provisionedAt: new Date(), schemaVersion: listMigrations().length } });
    if (trial) {
      await db.trialClaim.upsert({ where: { ownerEmailHash: hash }, create: { ownerEmailHash: hash, tenantId: tenant.id }, update: {} });
      await changeSubscription(tenant.id, trialPatch(settings.trialPlanKey, settings.trialDays), { source: input.source, actor: input.actor, reason: "Workspace created with a free trial" });
    } else {
      await changeSubscription(tenant.id, {}, { source: input.source, actor: input.actor, reason: priorTrial ? "Workspace created; owner already used a trial" : "Workspace created" });
    }
    invalidateTenant(slug);
    return { tenantId: tenant.id, slug, confirmToken: token, trial };
  } catch (e) {
    await client?.$disconnect().catch(() => {});
    client = null;
    if (schemaCreated) await dropSchema(schema).catch(() => {});
    await db.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    invalidateTenant(slug);
    if (e instanceof AppError) throw e;
    console.error("[provision] failed", e);
    throw new AppError("We couldn't create the workspace. Please try again in a moment.");
  } finally {
    await client?.$disconnect().catch(() => {});
  }
}
