import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, pendingMigrations, schemaNameFor } from "@/server/platform/migrate";
import { clientForSlug, currentTenant, forEachTenant, runInTenant, BillingLockedError } from "@/server/platform/runtime";
import { changeSubscription, addDays } from "@/server/platform/subscriptions";
import { DEFAULT_SLUG, invalidateTenant } from "@/server/platform/tenants";
import { emailHash } from "@/server/platform/crypto";

const A = "t-alpha-co";
const B = "t-beta-co";
const owner = (slug: string) => ({ slug, companyName: `${slug} Ltd`, ownerName: `Owner ${slug}`, ownerEmail: `owner@${slug}.test`, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" as const });

async function cleanup() {
  const p = platformDb();
  for (const slug of [A, B]) {
    await dropSchema(schemaNameFor(slug)).catch(() => {});
    await p.tenant.deleteMany({ where: { slug } });
    await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(`owner@${slug}.test`) } });
  }
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await createWorkspace(owner(A));
  await createWorkspace(owner(B));
}, 180_000);

afterAll(async () => {
  await cleanup();
});

describe("workspaces are separate databases", () => {
  it("each workspace gets its own schema, the full set of tables and its own base data", async () => {
    for (const slug of [A, B]) {
      const users = await runInTenant(slug, () => db.user.findMany({ include: { role: true } }));
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ email: `owner@${slug}.test`, role: { key: "SUPER_ADMIN" } });
      expect(await runInTenant(slug, () => db.leadStage.count())).toBe(9);
      expect(await runInTenant(slug, () => db.form.count({ where: { status: "PUBLISHED" } }))).toBe(3);
      expect(await runInTenant(slug, () => db.contact.count())).toBe(0);
    }
    expect(await pendingMigrations(schemaNameFor(A))).toEqual([]);
  });

  it("data written in one workspace is invisible in every other workspace", async () => {
    await runInTenant(A, () => db.contact.create({ data: { firstName: "Only", lastName: "InAlpha", phone: "+92 300 0000001" } }));
    expect(await runInTenant(A, () => db.contact.count())).toBe(1);
    expect(await runInTenant(B, () => db.contact.count())).toBe(0);
    expect(await db.contact.count({ where: { lastName: "InAlpha" } })).toBe(0); // the default workspace
    const schemas = await runInTenant(B, () => db.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`);
    expect(schemas[0]!.s).toBe(schemaNameFor(B));
  });

  it("a session from one workspace is not valid in another, and the same email can exist in both", async () => {
    const userA = await runInTenant(A, () => db.user.findFirstOrThrow());
    await runInTenant(A, () => db.session.create({ data: { id: "tenancy-test-session", userId: userA.id, expiresAt: addDays(new Date(), 1) } }));
    expect(await runInTenant(A, () => db.session.findUnique({ where: { id: "tenancy-test-session" } }))).not.toBeNull();
    expect(await runInTenant(B, () => db.session.findUnique({ where: { id: "tenancy-test-session" } }))).toBeNull();
    // Same address in two companies is two independent accounts.
    const role = await runInTenant(B, () => db.role.findUniqueOrThrow({ where: { key: "CRM_STAFF" } }));
    await runInTenant(B, () => db.user.create({ data: { email: "shared@example.test", name: "Shared B", passwordHash: "x", roleId: role.id } }));
    expect(await runInTenant(A, () => db.user.count({ where: { email: "shared@example.test" } }))).toBe(0);
  });

  it("interactive transactions stay inside the workspace", async () => {
    await runInTenant(B, () =>
      db.$transaction(async (tx) => {
        await tx.contact.create({ data: { firstName: "Tx", lastName: "InBeta" } });
        expect(await tx.contact.count({ where: { lastName: "InBeta" } })).toBe(1);
      }),
    );
    expect(await runInTenant(A, () => db.contact.count({ where: { lastName: "InBeta" } }))).toBe(0);
  });

  it("array-form transactions are refused (they would silently lose atomicity)", () => {
    expect(() => db.$transaction([] as never)).toThrow(/interactive/);
  });

  it("rejects unknown workspaces and falls back to the default for unknown request values", async () => {
    await expect(clientForSlug("no-such-company")).rejects.toThrow(/Unknown workspace/);
    expect((await currentTenant()).slug).toBe(DEFAULT_SLUG);
  });

  it("refuses reserved, duplicate and malformed workspace codes without creating anything", async () => {
    await expect(createWorkspace({ ...owner("admin"), slug: "admin" })).rejects.toThrow(/reserved/i);
    await expect(createWorkspace({ ...owner(A), ownerEmail: "someone@else.test" })).rejects.toThrow(/taken/i);
    await expect(createWorkspace({ ...owner("x"), slug: "X!" })).rejects.toThrow(/Workspace code/);
    expect(await platformDb().tenant.count({ where: { slug: { in: ["admin", "x!"] } } })).toBe(0);
  });

  it("forEachTenant visits each active workspace and isolates failures", async () => {
    const seen: string[] = [];
    const out = await forEachTenant(async (t) => {
      seen.push(t.slug);
      if (t.slug === A) throw new Error("boom");
      return t.slug;
    });
    expect(seen).toContain(A);
    expect(seen).toContain(B);
    expect(out.find((r) => r.slug === A)).toMatchObject({ ok: false, error: "boom" });
    expect(out.find((r) => r.slug === B)).toMatchObject({ ok: true });
  });
});

describe("billing lock makes a workspace read-only without deleting anything", () => {
  it("blocks writes but keeps reads, sign-in and password reset working", async () => {
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { slug: B } });
    await changeSubscription(t.id, { subStatus: "TRIALING", planKey: "growth", trialStartedAt: addDays(new Date(), -10), trialEndsAt: addDays(new Date(), -1) }, { source: "SYSTEM", reason: "test: trial ended" });
    await runInTenant(B, async () => {
      await currentTenant(); // refreshes the cached state the guard reads
      await expect(db.contact.create({ data: { firstName: "Blocked" } })).rejects.toBeInstanceOf(BillingLockedError);
      await expect(db.contact.count()).resolves.toBeGreaterThanOrEqual(1);
      const u = await db.user.findFirstOrThrow({ where: { email: `owner@${B}.test` } });
      await expect(db.user.update({ where: { id: u.id }, data: { name: "Renamed while locked" } })).rejects.toBeInstanceOf(BillingLockedError);
      // Signing in and resetting a password must still work.
      await expect(db.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })).resolves.toBeTruthy();
      await expect(db.session.create({ data: { id: "locked-session", userId: u.id, expiresAt: addDays(new Date(), 1) } })).resolves.toBeTruthy();
    });
    // A different, unlocked workspace is unaffected.
    await expect(runInTenant(A, () => db.contact.create({ data: { firstName: "Fine" } }))).resolves.toBeTruthy();
  });

  it("unlocks again when the subscription becomes active", async () => {
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { slug: B } });
    await changeSubscription(t.id, { subStatus: "ACTIVE", planKey: "growth", currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 30) }, { source: "ADMIN", actor: "test", reason: "paid" });
    await runInTenant(B, async () => {
      await currentTenant();
      await expect(db.contact.create({ data: { firstName: "Allowed again" } })).resolves.toBeTruthy();
    });
    const history = await platformDb().subscriptionHistory.findMany({ where: { tenantId: t.id }, orderBy: { at: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["TRIALING", "TRIALING", "ACTIVE"]);
  });
});
