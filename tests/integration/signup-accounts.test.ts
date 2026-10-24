import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const env = vi.hoisted(() => ({ ip: "10.0.0.1", jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": env.ip, "user-agent": "vitest" }),
  cookies: async () => ({
    get: (n: string) => (env.jar.has(n) ? { name: n, value: env.jar.get(n)! } : undefined),
    set: (n: string, v: string) => void env.jar.set(n, v),
    delete: (n: string) => void env.jar.delete(n),
  }),
}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signupAction } from "@/server/actions/signup";
import { acceptInvitationAction, inviteUserAction, revokeInvitationAction } from "@/server/actions/invitations";
import { requestPasswordResetAction, resetPasswordAction } from "@/server/actions/password-reset";
import { platformDb } from "@/server/platform/client";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { confirmWorkspaceEmail } from "@/server/platform/accounts";
import { newToken, sha256, emailHash } from "@/server/platform/crypto";
import { createWorkspace } from "@/server/platform/provision";
import { runInTenant } from "@/server/platform/runtime";
import { changeSubscription } from "@/server/platform/subscriptions";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUGS = ["t-sign-one", "t-sign-two", "t-sign-three"];
const EMAILS = ["owner@t-sign-one.test", "owner@t-sign-two.test", "owner2@t-sign-one.test", "owner@t-sign-three.test"];
const PASSWORD = "Correct-Horse-Battery-1";

async function cleanup() {
  const p = platformDb();
  for (const slug of SLUGS) {
    await dropSchema(schemaNameFor(slug)).catch(() => {});
    await p.tenant.deleteMany({ where: { slug } });
  }
  for (const e of EMAILS) await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(e) } });
  invalidateTenant();
}
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const signup = (o: Partial<Record<string, string>> = {}) =>
  signupAction(undefined, form({ companyName: "Signup One Ltd", slug: "t-sign-one", ownerName: "Sana Owner", ownerEmail: "owner@t-sign-one.test", password: PASSWORD, terms: "on", ...o } as Record<string, string>));
const redirected = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT") === true;

beforeAll(async () => {
  await cleanup();
  env.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; // fresh rate-limit window each run
}, 60_000);
afterAll(cleanup);

describe("public signup", () => {
  it("rejects weak passwords, missing terms, bad codes and honeypot fills without creating anything", async () => {
    env.jar.clear();
    expect(await signup({ password: "short1" })).toMatchObject({ fieldErrors: { password: expect.any(String) } });
    expect(await signup({ password: "onlyletterslongenough" })).toMatchObject({ fieldErrors: { password: "Include a number" } });
    expect(await signup({ terms: "" })).toMatchObject({ fieldErrors: { terms: expect.any(String) } });
    expect(await signup({ slug: "Bad Code" })).toMatchObject({ fieldErrors: { slug: expect.any(String) } });
    expect(await signup({ slug: "admin" })).toMatchObject({ fieldErrors: { slug: expect.stringMatching(/reserved/i) } });
    expect(await signup({ website: "http://spam.example" })).toMatchObject({ error: expect.any(String) });
    expect(await platformDb().tenant.count({ where: { slug: { in: [...SLUGS, "admin"] } } })).toBe(0);
  });

  it("creates the company, starts a 7-day trial, signs the owner in and remembers the workspace", async () => {
    env.jar.clear();
    let thrown: unknown;
    await signup().catch((e) => (thrown = e));
    expect(redirected(thrown)).toBe(true);
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { slug: "t-sign-one" } });
    expect(t).toMatchObject({ status: "ACTIVE", subStatus: "TRIALING", planKey: "growth", dbSchema: "t_t_sign_one", emailConfirmedAt: null });
    const days = Math.round((t.trialEndsAt!.getTime() - t.trialStartedAt!.getTime()) / 86_400_000);
    expect(days).toBe(7);
    expect(env.jar.get("yadea_tenant")).toBe("t-sign-one");
    expect(env.jar.has("yadea_session")).toBe(true);
    const owner = await runInTenant("t-sign-one", () => db.user.findFirstOrThrow({ include: { role: true } }));
    expect(owner).toMatchObject({ email: "owner@t-sign-one.test", role: { key: "SUPER_ADMIN" } });
    expect(await bcrypt.compare(PASSWORD, owner.passwordHash)).toBe(true);
    expect(await platformDb().subscriptionHistory.count({ where: { tenantId: t.id } })).toBe(1);
  });

  it("refuses a duplicate workspace code", async () => {
    expect(await signup({ ownerEmail: "someone@else.test" })).toMatchObject({ fieldErrors: { slug: expect.stringMatching(/taken/i) } });
  });

  it("gives one free trial per owner email: a second workspace for the same owner starts read-only until a plan is chosen", async () => {
    env.jar.clear();
    let thrown: unknown;
    await signup({ companyName: "Second Co", slug: "t-sign-two", ownerEmail: "owner@t-sign-one.test" }).catch((e) => (thrown = e));
    expect(redirected(thrown)).toBe(true);
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { slug: "t-sign-two" } });
    expect(t.subStatus).toBe("PENDING");
    expect(t.trialEndsAt).toBeNull();
  });
});

describe("email confirmation, invitations and plan limits", () => {
  const signInAsOwnerOfOne = async () => {
    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    const owner = await runInTenant("t-sign-one", () => db.user.findFirstOrThrow());
    const token = newToken();
    await runInTenant("t-sign-one", () => db.session.create({ data: { id: sha256(token), userId: owner.id, expiresAt: new Date(Date.now() + 3_600_000) } }));
    env.jar.set("yadea_session", token);
    return owner;
  };

  it("cannot invite anyone until the owner has confirmed their email", async () => {
    await signInAsOwnerOfOne();
    const role = await runInTenant("t-sign-one", () => db.role.findUniqueOrThrow({ where: { key: "CRM_STAFF" } }));
    expect(await inviteUserAction({ email: "a@t-sign-one.test", roleId: role.id })).toMatchObject({ ok: false, error: expect.stringMatching(/confirm your own email/i) });
  });

  it("confirms with a one-time link (works once, wrong/expired links do nothing)", async () => {
    const created = await createWorkspace({ slug: "t-sign-three", companyName: "Three", ownerName: "Tee", ownerEmail: "owner@t-sign-three.test", ownerPassword: PASSWORD, source: "ADMIN" });
    expect(await confirmWorkspaceEmail("not-the-token-at-all-not-the-token")).toBeNull();
    expect((await confirmWorkspaceEmail(created.confirmToken))?.emailConfirmedAt).toBeInstanceOf(Date);
    expect(await confirmWorkspaceEmail(created.confirmToken)).toBeNull();

    const one = await platformDb().tenant.findUniqueOrThrow({ where: { slug: "t-sign-one" } });
    await platformDb().tenant.update({ where: { id: one.id }, data: { emailConfirmedAt: new Date() } });
    invalidateTenant("t-sign-one");
  });

  it("invites by email, lets the invitee choose a password, and never reuses the link", async () => {
    await signInAsOwnerOfOne();
    const role = await runInTenant("t-sign-one", () => db.role.findUniqueOrThrow({ where: { key: "CRM_STAFF" } }));
    const sent = await inviteUserAction({ email: "Colleague@T-Sign-One.test", roleId: role.id, name: "Col League" });
    expect(sent).toMatchObject({ ok: true });
    // Email isn't configured in tests, so the link is returned to the inviter instead of pretending it was sent.
    const link = (sent as { data?: { link: string | null } }).data!.link!;
    expect(link).toMatch(/\/invite\/[\w-]{20,}$/);
    const token = link.split("/").pop()!;
    const stored = await runInTenant("t-sign-one", () => db.userInvitation.findFirstOrThrow());
    expect(stored.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token); // only the hash is stored

    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    expect(await acceptInvitationAction(undefined, form({ token, name: "Col League", password: "short" }))).toMatchObject({ fieldErrors: { password: expect.any(String) } });
    let thrown: unknown;
    await acceptInvitationAction(undefined, form({ token, name: "Col League", password: PASSWORD })).catch((e) => (thrown = e));
    expect(redirected(thrown)).toBe(true);
    const user = await runInTenant("t-sign-one", () => db.user.findUniqueOrThrow({ where: { email: "colleague@t-sign-one.test" }, include: { role: true } }));
    expect(user.role.key).toBe("CRM_STAFF");
    expect(env.jar.has("yadea_session")).toBe(true);
    // The link cannot be used a second time.
    expect(await acceptInvitationAction(undefined, form({ token, name: "Again", password: PASSWORD }))).toMatchObject({ error: expect.stringMatching(/invalid or has expired/i) });
  });

  it("a newer invitation replaces the older one, an expired or revoked one is rejected, and revoking works", async () => {
    await signInAsOwnerOfOne();
    const role = await runInTenant("t-sign-one", () => db.role.findUniqueOrThrow({ where: { key: "CRM_STAFF" } }));
    const first = ((await inviteUserAction({ email: "dup@t-sign-one.test", roleId: role.id })) as { data: { link: string } }).data.link.split("/").pop()!;
    const second = ((await inviteUserAction({ email: "dup@t-sign-one.test", roleId: role.id })) as { data: { link: string } }).data.link.split("/").pop()!;
    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    expect(await acceptInvitationAction(undefined, form({ token: first, name: "X", password: PASSWORD }))).toMatchObject({ error: expect.any(String) });

    // expired
    await runInTenant("t-sign-one", () => db.userInvitation.updateMany({ where: { tokenHash: sha256(second) }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    expect(await acceptInvitationAction(undefined, form({ token: second, name: "X", password: PASSWORD }))).toMatchObject({ error: expect.any(String) });

    await signInAsOwnerOfOne();
    const third = ((await inviteUserAction({ email: "dup@t-sign-one.test", roleId: role.id })) as { data: { link: string } }).data.link.split("/").pop()!;
    const pending = await runInTenant("t-sign-one", () => db.userInvitation.findFirstOrThrow({ where: { tokenHash: sha256(third) } }));
    expect(await revokeInvitationAction(pending.id)).toMatchObject({ ok: true });
    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    expect(await acceptInvitationAction(undefined, form({ token: third, name: "X", password: PASSWORD }))).toMatchObject({ error: expect.any(String) });
  });

  it("enforces the plan's staff-login limit, counting pending invitations", async () => {
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { slug: "t-sign-one" } });
    await changeSubscription(t.id, { planKey: "starter" }, { source: "ADMIN", actor: "test", reason: "limit test" }); // Starter = 5 logins
    await signInAsOwnerOfOne();
    const role = await runInTenant("t-sign-one", () => db.role.findUniqueOrThrow({ where: { key: "CRM_STAFF" } }));
    // owner + colleague = 2 users. Three more fit; the sixth does not.
    for (const n of [1, 2, 3]) expect(await inviteUserAction({ email: `fill${n}@t-sign-one.test`, roleId: role.id })).toMatchObject({ ok: true });
    expect(await inviteUserAction({ email: "fill4@t-sign-one.test", roleId: role.id })).toMatchObject({ ok: false, error: expect.stringMatching(/plan includes 5 staff logins/i) });
  });

  it("does not let one company's admin see another company's invitations", async () => {
    expect(await runInTenant("t-sign-three", () => db.userInvitation.count())).toBe(0);
  });
});

describe("forgot and reset password", () => {
  it("answers identically for real, unknown and wrong-workspace requests, and only creates a token for a real account", async () => {
    const ask = (workspace: string, email: string) => requestPasswordResetAction(undefined, form({ workspace, email }));
    const real = await ask("t-sign-one", "owner@t-sign-one.test");
    const unknownUser = await ask("t-sign-one", "nobody@t-sign-one.test");
    const unknownWs = await ask("no-such-company", "owner@t-sign-one.test");
    const wrongWs = await ask("t-sign-three", "owner@t-sign-one.test");
    expect(unknownUser).toEqual(real);
    expect(unknownWs).toEqual(real);
    expect(wrongWs).toEqual(real);
    expect(await runInTenant("t-sign-one", () => db.passwordResetToken.count())).toBe(1);
    expect(await runInTenant("t-sign-three", () => db.passwordResetToken.count())).toBe(0);
  });

  it("sets a new password from a single-use link, signs every session out and rejects reuse", async () => {
    const owner = await runInTenant("t-sign-one", () => db.user.findFirstOrThrow({ where: { email: "owner@t-sign-one.test" } }));
    const token = newToken();
    await runInTenant("t-sign-one", async () => {
      await db.passwordResetToken.create({ data: { userId: owner.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) } });
      await db.session.create({ data: { id: `s-${randomUUID()}`, userId: owner.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    });
    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    expect(await resetPasswordAction(undefined, form({ token, password: "weak" }))).toMatchObject({ fieldErrors: { password: expect.any(String) } });
    let thrown: unknown;
    await resetPasswordAction(undefined, form({ token, password: "Brand-New-Password-9" })).catch((e) => (thrown = e));
    expect(redirected(thrown)).toBe(true);
    const after = await runInTenant("t-sign-one", () => db.user.findUniqueOrThrow({ where: { id: owner.id } }));
    expect(await bcrypt.compare("Brand-New-Password-9", after.passwordHash)).toBe(true);
    expect(await runInTenant("t-sign-one", () => db.session.count({ where: { userId: owner.id } }))).toBe(0);
    expect(await resetPasswordAction(undefined, form({ token, password: "Another-Password-77" }))).toMatchObject({ error: expect.stringMatching(/invalid or has expired/i) });
  });

  it("rejects an expired reset link", async () => {
    const owner = await runInTenant("t-sign-one", () => db.user.findFirstOrThrow({ where: { email: "owner@t-sign-one.test" } }));
    const token = newToken();
    await runInTenant("t-sign-one", () => db.passwordResetToken.create({ data: { userId: owner.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() - 1000) } }));
    env.jar.clear();
    env.jar.set("yadea_tenant", "t-sign-one");
    expect(await resetPasswordAction(undefined, form({ token, password: "Another-Password-77" }))).toMatchObject({ error: expect.stringMatching(/invalid or has expired/i) });
  });
});
