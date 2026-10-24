import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { platformDb } from "@/server/platform/client";
import { encryptSecret, sha256 } from "@/server/platform/crypto";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { activatePlan, buildQuote, recordRefund } from "@/server/platform/billing";
import { changeSubscription } from "@/server/platform/subscriptions";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";
import { getMetrics } from "@/server/platform/metrics";
import { checkSecondFactor, ensureFirstAdmin } from "@/server/platform/admin-auth";
import { hotp, newTotpSecret } from "@/lib/totp";
import { maintenanceActive, savePlatformSettings } from "@/server/platform/settings";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const SLUG = "t-console-co";
const EMAIL = "owner@t-console-co.test";
const ADMIN_EMAIL = "t-console-admin@test.local";
const who = { source: "ADMIN" as const, actor: "operator@test", reason: "test" };
let tenantId = "";

async function cleanup() {
  const p = platformDb();
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await p.tenant.deleteMany({ where: { slug: SLUG } });
  await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  await p.platformAdmin.deleteMany({ where: { email: ADMIN_EMAIL } });
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  tenantId = (await createWorkspace({ slug: SLUG, companyName: "Console Co", ownerName: "Con", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
});
afterAll(async () => {
  await savePlatformSettings({ maintenance: { on: false, message: "" } }).catch(() => {});
  await cleanup();
});

describe("metrics", () => {
  it("counts only real records and keeps currencies apart", async () => {
    const from = new Date(Date.now() - 60_000);
    const before = await getMetrics(from, new Date(Date.now() + 60_000));
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const q = await buildQuote(t, { planKey: "growth", interval: "YEAR" });
    const inv = await activatePlan(tenantId, { ...q, coupon: null }, { method: "BANK_TRANSFER", reference: `console-${Date.now()}`, who });
    await recordRefund(inv.id, { amount: 1000, reason: "test refund" }, who);
    const after = await getMetrics(from, new Date(Date.now() + 60_000));

    const monthly = Math.round(q.base / 12);
    expect((after.mrr.PKR ?? 0) - (before.mrr.PKR ?? 0)).toBe(monthly);
    expect(Math.abs((after.arr.PKR ?? 0) - (after.mrr.PKR ?? 0) * 12)).toBeLessThanOrEqual(12); // ARR is MRR x 12 (MRR itself is rounded)
    expect((after.collected.PKR ?? 0) - (before.collected.PKR ?? 0)).toBe(q.total);
    expect((after.refunds.PKR ?? 0) - (before.refunds.PKR ?? 0)).toBe(1000);
    expect((after.net.PKR ?? 0) - (before.net.PKR ?? 0)).toBe(q.total - 1000);
    expect(after.signups).toBeGreaterThanOrEqual(1);
  });

  it("excludes the original workspace from customer counts", async () => {
    const m = await getMetrics(new Date(0), new Date());
    const customers = await platformDb().tenant.count({ where: { isLegacy: false } });
    expect(m.workspaces.total).toBe(customers);
  });

  it("counts a move from ACTIVE to EXPIRED as churn", async () => {
    const from = new Date(Date.now() - 60_000);
    const before = await getMetrics(from, new Date(Date.now() + 60_000));
    await changeSubscription(tenantId, { subStatus: "EXPIRED" }, who);
    const after = await getMetrics(from, new Date(Date.now() + 60_000));
    expect(after.churned).toBe(before.churned + 1);
  });
});

describe("platform admin second factor", () => {
  it("accepts a code once, rejects replay, and consumes recovery codes", async () => {
    const secret = newTotpSecret();
    const admin = await platformDb().platformAdmin.create({
      data: { email: ADMIN_EMAIL, name: "Console Test", passwordHash: await bcrypt.hash("Correct-Horse-Battery-1", 4), role: "SUPPORT", totpEnabled: true, totpSecretEnc: encryptSecret(secret), recoveryCodes: [sha256("recovery:abcde-12345")] },
    });
    const code = hotp(secret, Math.floor(Date.now() / 30_000));
    expect(await checkSecondFactor(admin, "000000")).toBe(false);
    expect(await checkSecondFactor(admin, code)).toBe(true);
    const fresh = await platformDb().platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(fresh.lastTotpStep).toBeGreaterThan(0);
    expect(await checkSecondFactor(fresh, code)).toBe(false); // replay within the same window
    expect(await checkSecondFactor(fresh, "ABCDE-12345")).toBe(true); // recovery code, case-insensitive
    const used = await platformDb().platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await checkSecondFactor(used, "abcde-12345")).toBe(false); // single use
  });

  it("only bootstraps the first owner when no admin exists", async () => {
    const count = await platformDb().platformAdmin.count();
    expect(count).toBeGreaterThan(0); // the admin created above
    process.env.PLATFORM_ADMIN_EMAIL = "should-not-exist@test.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "Correct-Horse-Battery-1";
    expect(await ensureFirstAdmin()).toBe(false);
    expect(await platformDb().platformAdmin.findUnique({ where: { email: "should-not-exist@test.local" } })).toBeNull();
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
  });
});

describe("maintenance mode", () => {
  it("makes workspaces read-only without blocking sign-in bookkeeping", async () => {
    const { clientForSlug } = await import("@/server/platform/runtime");
    await changeSubscription(tenantId, { subStatus: "ACTIVE", planKey: "growth" }, who);
    invalidateTenant();
    const db = await clientForSlug(SLUG);
    await savePlatformSettings({ maintenance: { on: true, message: "Back soon" } });
    expect(await maintenanceActive()).toBe(true);
    await expect(db.contact.create({ data: { firstName: "Blocked" } as never })).rejects.toThrow(/maintenance/i);
    await expect(db.session.deleteMany({ where: { userId: "none" } })).resolves.toBeDefined(); // sessions stay writable
    await savePlatformSettings({ maintenance: { on: false, message: "" } });
    expect(await maintenanceActive()).toBe(false);
  });
});
