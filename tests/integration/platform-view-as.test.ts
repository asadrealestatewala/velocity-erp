import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { emailHash, newToken, sha256 } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";
import { runInTenant, TENANT_COOKIE, VIEW_AS_COOKIE } from "@/server/platform/runtime";
import { db } from "@/lib/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest" }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => void jar.set(k, v), delete: (k: string | { name: string }) => void jar.delete(typeof k === "string" ? k : k.name) }),
}));
// Imported after the mock so the modules see it.
const load = async () => ({ session: await import("@/server/auth/session"), view: await import("@/server/platform/impersonation") });

const SLUG = "t-viewas-co";
const EMAIL = "owner@t-viewas-co.test";
const ADMIN_EMAIL = "t-viewas-admin@test.local";
let tenantId = "";
let adminId = "";
let ownerId = "";

async function cleanup() {
  const p = platformDb();
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await p.tenant.deleteMany({ where: { slug: SLUG } });
  await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  await p.platformImpersonation.deleteMany({ where: { adminEmail: ADMIN_EMAIL } });
  await p.platformAdmin.deleteMany({ where: { email: ADMIN_EMAIL } });
  invalidateTenant();
}

async function startView(minutes = 30) {
  const token = newToken();
  await platformDb().platformImpersonation.create({ data: { id: sha256(token), adminId, adminEmail: ADMIN_EMAIL, tenantId, tenantSlug: SLUG, userId: ownerId, userName: "Vee", userEmail: EMAIL, reason: "Customer reported a wrong report total", expiresAt: new Date(Date.now() + minutes * 60_000) } });
  jar.set(VIEW_AS_COOKIE, token);
  return token;
}

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  tenantId = (await createWorkspace({ slug: SLUG, companyName: "ViewAs Co", ownerName: "Vee", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
  adminId = (await platformDb().platformAdmin.create({ data: { email: ADMIN_EMAIL, name: "Sam Support", passwordHash: "x", role: "SUPPORT" } })).id;
  ownerId = (await runInTenant(SLUG, () => db.user.findFirstOrThrow({ where: { email: EMAIL } }))).id;
});
afterAll(cleanup);
beforeEach(() => { jar.clear(); jar.set(TENANT_COOKIE, SLUG); });

describe("read-only view as", () => {
  it("resolves the viewed user, flagged as an impersonation", async () => {
    await startView();
    const { session } = await load();
    const u = await session.getCurrentUser.call(null);
    expect(u?.email).toBe(EMAIL);
    expect(u?.impersonation?.adminEmail).toBe(ADMIN_EMAIL);
  });

  it("allows reads but refuses every database write while the view is active", async () => {
    await startView();
    expect(await db.user.count()).toBeGreaterThan(0);
    await expect(db.contact.create({ data: { firstName: "No", lastName: "Write" } as never })).rejects.toThrow(/read-only/i);
    await expect(db.user.update({ where: { id: ownerId }, data: { name: "Changed" } })).rejects.toThrow(/read-only/i);
    await expect(db.session.create({ data: { id: "x", userId: ownerId, expiresAt: new Date() } })).rejects.toThrow(/read-only/i);
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).name).toBe("Vee");
  });

  it("writes work normally without the view cookie", async () => {
    await db.user.update({ where: { id: ownerId }, data: { name: "Vee" } });
  });

  it("ignores expired, ended and revoked views", async () => {
    const { view } = await load();
    const expired = await startView(-5);
    expect(await view.currentViewAs.call(null)).toBeNull();
    const t = await startView();
    await platformDb().platformImpersonation.update({ where: { id: sha256(t) }, data: { endedAt: new Date() } });
    expect(await view.currentViewAs.call(null)).toBeNull();
    void expired;
  });

  it("stops working when the operator is disabled or loses the permission", async () => {
    const { view } = await load();
    await startView();
    await platformDb().platformAdmin.update({ where: { id: adminId }, data: { role: "ANALYTICS" } });
    expect(await view.currentViewAs.call(null)).toBeNull();
    await platformDb().platformAdmin.update({ where: { id: adminId }, data: { role: "SUPPORT", isActive: false } });
    expect(await view.currentViewAs.call(null)).toBeNull();
    await platformDb().platformAdmin.update({ where: { id: adminId }, data: { isActive: true } });
  });

  it("does not apply to scripts and cron that run in an explicit workspace context", async () => {
    await startView();
    await runInTenant(SLUG, () => db.user.update({ where: { id: ownerId }, data: { name: "Vee" } }));
  });
});
