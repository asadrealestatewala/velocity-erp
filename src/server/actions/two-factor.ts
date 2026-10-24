"use server";
import { db } from "@/lib/db";
import { newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { audit } from "@/server/audit";
import { getCurrentUser, verifyPassword } from "@/server/auth/session";
import { AppError, runAction } from "@/server/errors";
import { decryptSecret, encryptSecret, sha256 } from "@/server/platform/crypto";
import { currentTenant } from "@/server/platform/runtime";

async function me() {
  const u = await getCurrentUser();
  if (!u) throw new AppError("Your session has expired. Please sign in again.", "UNAUTHENTICATED");
  return u;
}

/** Step 1: generate a secret (stored encrypted, not active until a code from the app proves it works). */
export async function beginTwoFactorAction() {
  return runAction(async () => {
    const u = await me();
    const secret = newTotpSecret();
    await db.user.update({ where: { id: u.id }, data: { totpSecretEnc: encryptSecret(secret), totpEnabled: false } });
    const workspace = await currentTenant();
    return { ok: true as const, data: { secret, url: otpauthUrl(secret, u.email, `${process.env.PLATFORM_NAME || "YADEA CRM"} (${workspace.slug})`) } };
  });
}

/** Step 2: the user types a code from the app; only then is two-factor switched on and recovery codes issued. */
export async function confirmTwoFactorAction(code: string) {
  return runAction(async () => {
    const u = await me();
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!row.totpSecretEnc) throw new AppError("Start the setup first.");
    const step = verifyTotp(decryptSecret(row.totpSecretEnc), code);
    if (step === null) throw new AppError("That code is not right. Check the time on your phone and try again.");
    const codes = newRecoveryCodes();
    await db.user.update({ where: { id: u.id }, data: { totpEnabled: true, lastTotpStep: step, recoveryCodes: codes.map((c) => sha256(`recovery:${c.toLowerCase()}`)) } });
    await audit({ userId: u.id, action: "auth.2fa_enabled", entityType: "User", entityId: u.id });
    return { ok: true as const, data: { recoveryCodes: codes }, message: "Two-factor sign-in is on. Save your recovery codes now." };
  });
}

export async function disableTwoFactorAction(password: string) {
  return runAction(async () => {
    const u = await me();
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(password, row.passwordHash))) throw new AppError("Your password is not correct.");
    await db.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodes: [], lastTotpStep: 0 } });
    await audit({ userId: u.id, action: "auth.2fa_disabled", entityType: "User", entityId: u.id });
    return { ok: true as const, message: "Two-factor sign-in is off." };
  });
}
