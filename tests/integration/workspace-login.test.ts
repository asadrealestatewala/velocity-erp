import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.2", "user-agent": "vitest" }),
  cookies: async () => ({
    get: (n: string) => (jar.store.has(n) ? { name: n, value: jar.store.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.store.set(n, v),
    delete: (n: string) => void jar.store.delete(n),
  }),
}));

import { db } from "@/lib/db";
import { loginWithResultAction } from "@/server/actions/auth";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { runInTenant } from "@/server/platform/runtime";
import { changeSubscription } from "@/server/platform/subscriptions";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUGS = ["t-login-one", "t-login-two"];
const PASSWORD = "Correct-Horse-Battery-1";
const form = (workspace: string | null, identifier: string, password = PASSWORD) => {
  const fd = new FormData();
  if (workspace !== null) fd.set("workspace", workspace);
  fd.set("identifier", identifier);
  fd.set("password", password);
  fd.set("portal", "crm");
  return fd;
};

async function cleanup() {
  const p = platformDb();
  for (const slug of SLUGS) {
    await dropSchema(schemaNameFor(slug)).catch(() => {});
    await p.tenant.deleteMany({ where: { slug } });
    await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(`boss@${slug}.test`) } });
  }
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  for (const slug of SLUGS) await createWorkspace({ slug, companyName: slug, ownerName: "Boss", ownerEmail: `boss@${slug}.test`, ownerPassword: PASSWORD, source: "ADMIN" });
}, 180_000);
afterAll(cleanup);

describe("signing in with a workspace code", () => {
  it("signs the owner into their own company and remembers it", async () => {
    jar.store.clear();
    const r = await loginWithResultAction(undefined, form("t-login-one", "boss@t-login-one.test"));
    expect(r).toEqual({ ok: true, redirectTo: "/crm/dashboard" });
    expect(jar.store.get("yadea_tenant")).toBe("t-login-one");
    expect(await runInTenant("t-login-one", () => db.session.count())).toBe(1);
    expect(await runInTenant("t-login-two", () => db.session.count())).toBe(0);
  });

  it("does not accept one company's credentials in another, or in the default workspace", async () => {
    jar.store.clear();
    expect((await loginWithResultAction(undefined, form("t-login-two", "boss@t-login-one.test"))).ok).toBe(false);
    expect((await loginWithResultAction(undefined, form("", "boss@t-login-one.test"))).ok).toBe(false);
    expect((await loginWithResultAction(undefined, form(null, "boss@t-login-one.test"))).ok).toBe(false);
    expect(jar.store.has("yadea_session")).toBe(false);
  });

  it("answers an unknown or malformed workspace exactly like a wrong password (no workspace enumeration)", async () => {
    const wrong = await loginWithResultAction(undefined, form("t-login-one", "boss@t-login-one.test", "nope-nope-nope"));
    const unknown = await loginWithResultAction(undefined, form("no-such-company", "boss@t-login-one.test"));
    const malformed = await loginWithResultAction(undefined, form("Bad Code!", "boss@t-login-one.test"));
    expect(unknown).toEqual(wrong);
    expect(malformed).toEqual(wrong);
  });

  it("blocks sign-in to a suspended workspace but still lets a read-only (cancelled-trial) one sign in", async () => {
    const two = await platformDb().tenant.findUniqueOrThrow({ where: { slug: "t-login-two" } });
    await platformDb().tenant.update({ where: { id: two.id }, data: { status: "SUSPENDED" } });
    invalidateTenant("t-login-two");
    const blocked = await loginWithResultAction(undefined, form("t-login-two", "boss@t-login-two.test"));
    expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/suspended/i) });

    await platformDb().tenant.update({ where: { id: two.id }, data: { status: "ACTIVE" } });
    await changeSubscription(two.id, { subStatus: "EXPIRED" }, { source: "SYSTEM", reason: "test: expired" });
    const readOnly = await loginWithResultAction(undefined, form("t-login-two", "boss@t-login-two.test"));
    expect(readOnly).toEqual({ ok: true, redirectTo: "/crm/dashboard" });
  });
});
