import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Real-channel providers. Nothing here pretends to work: when credentials are missing the channel reports
 * "not configured" and callers must fall back to manual logging — a message is only ever marked SENT when the
 * provider accepted it.
 */

export class ProviderError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

// ───────── WhatsApp (Meta WhatsApp Business Cloud API) ─────────

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}
/** Inbound webhooks additionally need the app secret (to verify signatures) and a verify token (for the subscribe handshake). */
export function whatsappWebhookConfigured() {
  return !!(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}

/** Free-text WhatsApp messages are only allowed inside this window after the customer's last message. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendWhatsAppText(toDigits: string, body: string): Promise<{ externalId: string }> {
  if (!whatsappConfigured()) throw new ProviderError("WhatsApp is not connected.");
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toDigits, type: "text", text: { preview_url: false, body } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ProviderError(`Could not reach WhatsApp: ${(e as Error).message}`, true);
  }
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !json.messages?.[0]?.id) {
    const code = json.error?.code;
    // 131047 = outside the 24-hour customer-service window; 131026 = number not on WhatsApp.
    const hint = code === 131047 ? " The customer must message you first (or you need an approved template)." : code === 131026 ? " That number may not be on WhatsApp." : "";
    throw new ProviderError(`WhatsApp rejected the message: ${json.error?.message ?? res.statusText}.${hint}`, res.status >= 500);
  }
  return { externalId: json.messages[0].id };
}

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function verifyWhatsAppHandshake(mode: string | null, token: string | null) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected || mode !== "subscribe" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────── Email ─────────

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}
export function emailInboundConfigured() {
  return !!process.env.EMAIL_INBOUND_SECRET;
}

/** Sender used for CRM email. MAIL_FROM is shared with the platform's system mail; EMAIL_FROM is the older SMTP-only name. */
const mailFrom = () => process.env.MAIL_FROM || process.env.EMAIL_FROM;

/** Sends one plain-text email through Resend (preferred when RESEND_API_KEY is set) or SMTP. Throws ProviderError on rejection. */
export async function deliverEmail(p: { to: string; subject: string; body: string; replyTo?: string }): Promise<{ externalId: string | null }> {
  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: mailFrom(), to: [p.to], subject: p.subject, text: p.body, reply_to: p.replyTo }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!r.ok) throw new Error(data.message ?? `Resend ${r.status}`);
      return { externalId: data.id ?? null };
    } catch (e) {
      throw new ProviderError(`The email server rejected the message: ${(e as Error).message}`, true);
    }
  }
  if (!process.env.SMTP_HOST) throw new ProviderError("Email is not connected.");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    const info = await transport.sendMail({ from: mailFrom(), replyTo: p.replyTo, to: p.to, subject: p.subject, text: p.body });
    return { externalId: info.messageId ?? null };
  } catch (e) {
    throw new ProviderError(`The email server rejected the message: ${(e as Error).message}`, true);
  }
}

export async function sendEmail(p: { to: string; subject: string; body: string }): Promise<{ externalId: string | null }> {
  if (!emailConfigured()) throw new ProviderError("Email is not connected.");
  return deliverEmail({ ...p, replyTo: process.env.EMAIL_REPLY_TO || undefined });
}

export function verifyInboundEmailSecret(header: string | null) {
  const expected = process.env.EMAIL_INBOUND_SECRET;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function channelStatus() {
  return {
    whatsapp: whatsappConfigured(),
    whatsappInbound: whatsappWebhookConfigured(),
    email: emailConfigured(),
    emailInbound: emailInboundConfigured(),
  };
}
export type ChannelStatus = ReturnType<typeof channelStatus>;
