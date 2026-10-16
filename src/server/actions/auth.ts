"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, hashPassword, verifyPassword } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/request";
import { hashIdentifier, rateLimit } from "@/server/rate-limit";
import { runAction } from "@/server/errors";

export type LoginState = { error?: string } | undefined;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  portal: z.enum(["crm", "portal"]),
  next: z.string().optional(),
});

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const { email, password, portal, next } = parsed.data;

  const ip = await clientIp();
  const okIp = await rateLimit(`login:ip:${hashIdentifier(ip)}`, 20, 15 * 60);
  const okUser = await rateLimit(`login:user:${hashIdentifier(email)}`, 8, 15 * 60);
  if (!okIp || !okUser) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };

  const user = await db.user.findUnique({ where: { email }, include: { role: true } });
  // Constant-ish work even when the user doesn't exist, to avoid account enumeration via timing.
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.ZpQb6Y5fmmS0cVnS3SrcX1Jb7dZ2");
  if (!user || !valid || !user.isActive) {
    await audit({ userId: user?.id, action: "auth.login_failed", entityType: "User", entityId: user?.id, changes: { email }, ipAddress: hashIdentifier(ip) });
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipAddress: hashIdentifier(ip) });

  const central = user.role.scope === "CENTRAL";
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (central) redirect(safeNext?.startsWith("/crm") ? safeNext : "/crm/dashboard");
  redirect(safeNext?.startsWith("/portal") ? safeNext : portal === "portal" ? "/portal/dashboard" : "/portal/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ userId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
  redirect(user?.scope === "DEALERSHIP" ? "/portal/login" : "/login");
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
