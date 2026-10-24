import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.3", "user-agent": "vitest" }),
  cookies: async () => ({
    get: (n: string) => (jar.store.has(n) ? { name: n, value: jar.store.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.store.set(n, v),
    delete: (n: string) => void jar.store.delete(n),
  }),
}));

import { db } from "@/lib/db";
import { loginWithResultAction } from "@/server/actions/auth";
import { hotp, newTotpSecret } from "@/lib/totp";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { runInTenant } from "@/server/platform/runtime";
import { emailHash, encryptSecret, sha256 } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUG = "t-twofa-co";
const EMAIL = `boss@${SLUG}.test`;
const PASSWORD = "Correct-Horse-Battery-1";
const SECRET = newTotpSecret();
const form = (code?: string) => {
  const fd = new FormData();
  fd.set("workspace", SLUG);
  fd.set("identifier", EMAIL);
  fd.set("password", PASSWORD);
  fd.set("portal", "crm");
  if (code !== undefined) fd.set("code", code);
  return fd;
};
const sessions = () => runInTenant(SLUG, () => db.session.count());

async function cleanup() {
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await platformDb().tenant.deleteMany({ where: { slug: SLUG } });
  await platformDb().trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await createWorkspace({ slug: SLUG, companyName: "Two Factor Co", ownerName: "Boss", ownerEmail: EMAIL, ownerPassword: PASSWORD, source: "ADMIN" });
  await runInTenant(SLUG, () => db.user.update({ where: { email: EMAIL }, data: { totpEnabled: true, totpSecretEnc: encryptSecret(SECRET), recoveryCodes: [sha256("recovery:abcde-12345")] } }));
}, 180_000);
afterAll(cleanup);

describe("two-factor sign-in for workspace staff", () => {
  it("asks for the code after a correct password and creates no session yet", async () => {
    jar.store.clear();
    const r = await loginWithResultAction(undefined, form());
    expect(r).toMatchObject({ ok: false, needsCode: true });
    expect(await sessions()).toBe(0);
  });

  it("rejects a wrong code, then accepts the right one exactly once", async () => {
    jar.store.clear();
    const bad = await loginWithResultAction(undefined, form("000000"));
    expect(bad).toMatchObject({ ok: false, needsCode: true });
    expect(await sessions()).toBe(0);

    const code = hotp(SECRET, Math.floor(Date.now() / 30_000));
    const ok = await loginWithResultAction(undefined, form(code));
    expect(ok).toEqual({ ok: true, redirectTo: "/crm/dashboard" });
    expect(await sessions()).toBe(1);

    jar.store.clear();
    const replay = await loginWithResultAction(undefined, form(code));
    expect(replay).toMatchObject({ ok: false, needsCode: true }); // same code cannot be used twice
    expect(await sessions()).toBe(1);
  });

  it("accepts a recovery code once", async () => {
    jar.store.clear();
    expect((await loginWithResultAction(undefined, form("ABCDE-12345"))).ok).toBe(true);
    jar.store.clear();
    expect((await loginWithResultAction(undefined, form("abcde-12345"))).ok).toBe(false);
  });

  it("does not ask for a code when the password is wrong", async () => {
    const fd = form();
    fd.set("password", "not-the-password-1");
    const r = await loginWithResultAction(undefined, fd);
    expect(r).toMatchObject({ ok: false });
    expect((r as { needsCode?: boolean }).needsCode).toBeUndefined();
  });
});
