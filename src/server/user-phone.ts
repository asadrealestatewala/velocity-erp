import "server-only";
import { db, type Tx } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { getSettings } from "@/server/settings";

/**
 * Prepares a user's phone for storage. The normalised digits are what mobile-number sign-in matches on,
 * so they must be unique across all accounts — otherwise one number could open someone else's account.
 */
export async function userPhoneFields(phone: string | null | undefined, opts: { excludeUserId?: string; tx?: Tx } = {}) {
  const raw = phone?.trim() || null;
  if (!raw) return { phone: null, phoneNormalized: null };
  const sys = await getSettings();
  const phoneNormalized = normalizePhone(raw, sys.defaultCountryCode);
  if (!phoneNormalized) throw new AppError("Enter a valid mobile number.", "VALIDATION", { phone: "Enter a valid mobile number" });
  const clash = await (opts.tx ?? db).user.findFirst({
    where: { phoneNormalized, ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("That mobile number is already used by another account.", "CONFLICT", { phone: "Already used by another account" });
  return { phone: raw, phoneNormalized };
}
