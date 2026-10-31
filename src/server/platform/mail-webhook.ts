import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Resend (Svix) webhook: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` with the base64 part of the
 * `whsec_…` signing secret, compared in constant time, within a 5-minute window. Returns false for anything malformed.
 */
export function verifyResendSignature(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, now = Date.now()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  for (const part of headers.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type ResendEvent = { type: string; created_at?: string; data?: Record<string, unknown> };

export const DELIVERY_FROM_EVENT: Record<string, "SENT" | "DELIVERED" | "DELAYED" | "BOUNCED" | "COMPLAINED" | "FAILED"> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.delivery_delayed": "DELAYED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
};

const RANK: Record<string, number> = { QUEUED: 0, NOT_SENT: 0, SENT: 1, DELAYED: 2, DELIVERED: 3, FAILED: 4, BOUNCED: 4, COMPLAINED: 5 };
/** Events can arrive out of order; a status only ever moves forward (a late "sent" never hides "bounced"). */
export const deliveryAdvances = (current: string | null | undefined, next: string) => (RANK[next] ?? 0) >= (RANK[current ?? "QUEUED"] ?? 0);

/** Same conversation = same mailbox + same other party + same subject without Re:/Fwd: prefixes. */
export function threadKeyFor(mailboxKey: string, otherParty: string, subject: string): string {
  const base = subject.replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/gi, "").trim().toLowerCase().replace(/\s+/g, " ");
  return `thr:${mailboxKey}:${otherParty.trim().toLowerCase()}:${base.slice(0, 120)}`;
}

/** `Name <a@b.co>` → { name, address }. */
export function parseAddress(raw: string): { name: string | null; address: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2]! : raw).trim().toLowerCase();
  return { name: m?.[1]?.trim() || null, address };
}

/** A readable text body from HTML-only mail. Never used to render HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
