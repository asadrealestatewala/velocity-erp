import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Key derived from APP_SECRET. Rotating APP_SECRET invalidates stored secrets (connection strings, TOTP seeds, payment keys). */
function key() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return createHash("sha256").update(`yadea-platform:${secret}`).digest();
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function decryptSecret(token: string): string {
  const raw = Buffer.from(token, "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Random URL-safe token (the raw value goes in the link; only its hash is stored). */
export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Hash used for the one-trial-per-owner rule; lower-cased and trimmed so spelling variants collide. */
export const emailHash = (email: string) => sha256(`email:${email.trim().toLowerCase()}`);
