"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, hashPassword, loadUser, verifyPassword } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/request";
import { hashIdentifier, rateLimit } from "@/server/rate-limit";
import { runAction } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { normalizePhone } from "@/lib/utils";
import { homePathFor } from "@/lib/home";
import { runInTenant, currentTenant } from "@/server/platform/runtime";
import { DEFAULT_SLUG, getTenant, isValidSlug } from "@/server/platform/tenants";
import { billingState } from "@/server/platform/billing-state";
import { checkUserSecondFactor } from "@/server/auth/two-factor";

export type LoginState = { error?: string } | undefined;
/** Outcome for the animated sign-in screen: it plays the success scene only on a genuine `ok`. */
export type LoginResult = { ok: true; redirectTo: string } | { ok: false; error: string; needsCode?: boolean };

const loginSchema = z.object({
  // An email address OR a mobile number (dealership staff may use either).
  identifier: z.string().trim().min(3, "Enter your email or mobile number").max(160),
  password: z.string().min(1).max(200),
  portal: z.enum(["crm", "portal", "procurement"]),
  next: z.string().optional(),
  // Workspace (company) code. Empty = the default workspace.
  workspace: z.string().trim().max(60).optional(),
});

/** Dummy hash so a missing account costs the same time as a wrong password (no account enumeration). */
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.ZpQb6Y5fmmS0cVnS3SrcX1Jb7dZ2";

const INVALID = "Invalid email / mobile number or password.";

/**
 * The single authentication path. Returns the outcome instead of redirecting so callers choose how to navigate.
 * The workspace code selects which company's database is checked; an unknown code looks exactly like a wrong password.
 */
async function authenticate(formData: FormData): Promise<LoginResult> {
  const requested = String(formData.get("workspace") ?? "").trim().toLowerCase();
  const slug = requested || DEFAULT_SLUG;
  const tenant = isValidSlug(slug) ? await getTenant(slug).catch(() => null) : null;
  if (!tenant || tenant.status === "PROVISIONING") {
    await verifyPassword(String(formData.get("password") ?? ""), DUMMY_HASH); // same cost as a real attempt
    return { ok: false, error: INVALID };
  }
  return runInTenant(slug, () => authenticateInWorkspace(formData));
}

async function authenticateInWorkspace(formData: FormData): Promise<LoginResult> {
  const workspace = await currentTenant();
  if (billingState(workspace).blocked) return { ok: false, error: "This workspace is suspended. Please contact support." };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter your email or mobile number and your password." };
  const { identifier, password, next } = parsed.data;

  const isEmail = identifier.includes("@");
  const sys = await getSettings();
  const email = isEmail ? identifier.toLowerCase() : null;
  const phoneNormalized = isEmail ? null : normalizePhone(identifier, sys.defaultCountryCode);
  if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email!) : !phoneNormalized) {
    return { ok: false, error: "Enter a valid email address or mobile number." };
  }
  const key = email ?? phoneNormalized!;

  const ip = await clientIp();
  const okIp = await rateLimit(`login:ip:${hashIdentifier(ip)}`, 20, 15 * 60);
  const okUser = await rateLimit(`login:user:${hashIdentifier(key)}`, 8, 15 * 60);
  if (!okIp || !okUser) return { ok: false, error: "Too many sign-in attempts. Please wait 15 minutes and try again." };

  const user = await db.user.findUnique({ where: email ? { email } : { phoneNormalized: phoneNormalized! }, include: { role: true } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH);
  if (!user || !valid || !user.isActive) {
    // Never store a full phone number in the audit trail — keep the last 4 digits only.
    const shown = email ?? `phone …${phoneNormalized!.slice(-4)}`;
    await audit({ userId: user?.id, action: "auth.login_failed", entityType: "User", entityId: user?.id, changes: { identifier: shown, via: email ? "email" : "mobile" }, ipAddress: hashIdentifier(ip) });
    return { ok: false, error: INVALID };
  }

  if (user.totpEnabled) {
    const code = String(formData.get("code") ?? "");
    if (!code.trim()) return { ok: false, error: "", needsCode: true };
    if (!(await checkUserSecondFactor(user, code))) {
      await audit({ userId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id, changes: { reason: "second factor" }, ipAddress: hashIdentifier(ip) });
      return { ok: false, error: "That code is not valid. Enter the current 6-digit code from your authenticator app, or a recovery code.", needsCode: true };
    }
  }

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, changes: { via: email ? "email" : "mobile" }, ipAddress: hashIdentifier(ip) });

  const full = await loadUser(user.id);
  const home = homePathFor(user.role.scope, full?.permissions ?? new Set());
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const area = user.role.scope === "CENTRAL" ? ["/crm", "/procurement"] : ["/portal"];
  return { ok: true, redirectTo: safeNext && area.some((a) => safeNext.startsWith(a)) ? safeNext : home };
}

/** Classic form action: redirects straight away on success. */
export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const r = await authenticate(formData);
  if (!r.ok) return { error: r.needsCode ? "Two-factor sign-in needs JavaScript. Please enable it and try again." : r.error };
  redirect(r.redirectTo);
}

/** Same authentication, but hands the result back so the client can play the sign-in animation, then navigate. */
export async function loginWithResultAction(_: LoginResult | undefined, formData: FormData): Promise<LoginResult> {
  return authenticate(formData);
}
export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ userId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
  const procurementOnly = !!user && user.scope === "CENTRAL" && !user.permissions.has("dashboard.view") && user.permissions.has("procurement.view");
  redirect(user?.scope === "DEALERSHIP" ? "/portal/login" : procurementOnly ? "/procurement/login" : "/login");
}

const pwSchema = z
  .object({
    current: z.string().min(1, "Required"),
    next: z.string().min(10, "At least 10 characters").max(200).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function changePasswordAction(input: z.input<typeof pwSchema>) {
  return runAction(async () => {
    const me = await getCurrentUser();
    if (!me) throw new Error("Not signed in");
    const v = pwSchema.parse(input);
    const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(v.current, u.passwordHash))) {
      return { ok: false as const, error: "Current password is incorrect.", fieldErrors: { current: "Incorrect password" } };
    }
    await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(v.next), mustChangePassword: false } });
    // Invalidate every other session after a password change.
    await db.session.deleteMany({ where: { userId: me.id } });
    await createSession(me.id);
    await audit({ userId: me.id, action: "auth.password_changed", entityType: "User", entityId: me.id });
    return { ok: true as const, message: "Password updated." };
  });
}
