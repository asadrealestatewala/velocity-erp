import "server-only";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";
import { decryptSecret, sha256 } from "@/server/platform/crypto";

/**
 * Checks an authenticator code or a one-time recovery code for a workspace user. A code is accepted once: its
 * 30-second step must be newer than the last one used, so a code that was shoulder-surfed or intercepted cannot be replayed.
 */
export async function checkUserSecondFactor(user: Pick<User, "id" | "totpSecretEnc" | "lastTotpStep" | "recoveryCodes">, code: string): Promise<boolean> {
  const clean = code.trim();
  if (!clean) return false;
  if (user.totpSecretEnc) {
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), clean);
    if (step !== null && step > user.lastTotpStep) {
      await db.user.update({ where: { id: user.id }, data: { lastTotpStep: step } });
      return true;
    }
  }
  const hashes = (user.recoveryCodes as string[] | null) ?? [];
  const h = sha256(`recovery:${clean.toLowerCase()}`);
  if (hashes.includes(h)) {
    await db.user.update({ where: { id: user.id }, data: { recoveryCodes: hashes.filter((x) => x !== h) } });
    return true;
  }
  return false;
}
