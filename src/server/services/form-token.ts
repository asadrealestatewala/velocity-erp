import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Signed render token: proves the form was rendered by us and measures fill time (bot heuristic). */
export function issueFormToken(formId: string) {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", env.appSecret).update(`${formId}.${ts}`).digest("base64url");
  return { token: `${ts}.${sig}`, idempotencyKey: randomUUID() };
}

export function checkFormToken(formId: string, token: string | undefined, minSeconds = 2) {
  if (!token) return { ok: false as const, reason: "missing" };
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return { ok: false as const, reason: "malformed" };
  const expected = createHmac("sha256", env.appSecret).update(`${formId}.${ts}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false as const, reason: "signature" };
  const age = Date.now() - Number(ts);
  if (age < minSeconds * 1000) return { ok: false as const, reason: "too_fast" };
  if (age > 24 * 3600 * 1000) return { ok: false as const, reason: "expired" };
  return { ok: true as const };
}
