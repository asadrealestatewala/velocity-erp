import "server-only";
import { platformDb } from "./client";
import { loadMailConfig, senderFor } from "./mail-config";
import { DEFAULT_BRAND, layoutMail, type MailContent } from "./mail-layout";
import type { MailCategory, MailTemplateKey } from "./mail-templates";
import { DEFAULT_SLUG } from "./tenants";

/** Public base URL of the platform (no trailing slash). */
export const appBaseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Link into a workspace. The default workspace keeps its plain URLs; every other company is addressed as /w/<code>/… */
export const workspaceUrl = (slug: string, path = "/") => `${appBaseUrl()}${slug === DEFAULT_SLUG ? "" : `/w/${slug}`}${path.startsWith("/") ? path : `/${path}`}`;

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);

export type MailResult = { delivered: boolean; via: "resend" | "smtp" | "log"; providerId?: string | null; messageId?: string | null };

/** One branded, accessible layout for every system email (plain-text alternative always included). Branding comes from Mail → Branding in the console. */
export async function renderMail(opts: MailContent) {
  let brand = DEFAULT_BRAND;
  try {
    brand = (await loadMailConfig()).brand;
  } catch (e) {
    console.error("[mail] using default branding:", (e as Error).message);
  }
  return layoutMail(brand, appBaseUrl(), opts);
}

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Picks the sender identity (billing@, support@, no-reply@) from the routing set in the console. Default "system". */
  category?: MailCategory;
  /** Force one mailbox (used for replies written from the inbox). */
  mailbox?: string;
  templateKey?: MailTemplateKey | string;
  tenantId?: string | null;
  sentByEmail?: string | null;
  /** RFC 5322 threading headers for replies. */
  inReplyTo?: string | null;
  references?: string | null;
  threadKey?: string;
  /** Contains a one-time link or code: the sent log keeps the subject and status but not the body. Always true for the "auth" category. */
  sensitive?: boolean;
};

const HIDDEN_BODY = "[Content not stored: this message contains a one-time link.]";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Writes the sent-mail log row. Never throws: logging a message must not break sending it. */
async function logOutgoing(m: OutgoingMail, sender: { mailboxKey: string; address: string; from: string }, r: { delivery: "SENT" | "NOT_SENT" | "FAILED"; detail?: string; providerId?: string | null }): Promise<string | null> {
  const hide = Boolean(m.sensitive) || m.category === "auth";
  try {
    const name = sender.from.match(/^(.*)<[^>]+>$/)?.[1]?.trim() || null;
    const row = await platformDb().mailMessage.create({
      data: {
        direction: "OUTBOUND", mailboxKey: sender.mailboxKey, category: m.category ?? "system", templateKey: m.templateKey ?? null,
        fromAddress: sender.address, fromName: name, toAddress: m.to.trim().toLowerCase(), subject: clip(m.subject, 300), bodyText: hide ? HIDDEN_BODY : clip(m.text, 50_000), bodyHtml: !hide && m.html ? clip(m.html, 200_000) : null,
        providerId: r.providerId ?? null, inReplyTo: m.inReplyTo ?? null, threadKey: m.threadKey ?? `out:${r.providerId ?? Math.random().toString(36).slice(2)}`,
        tenantId: m.tenantId ?? null, delivery: r.delivery, deliveryDetail: r.detail ?? null, sentByEmail: m.sentByEmail ?? null,
      },
    });
    return row.id;
  } catch (e) {
    console.error("[mail] could not log message:", (e as Error).message);
    return null;
  }
}

/**
 * Sends a system email through Resend (RESEND_API_KEY) or SMTP (SMTP_HOST) from the identity chosen for its category,
 * and records it in the console's sent log. With neither provider configured the message is written to the server log
 * and `delivered:false` is returned, so callers can show the link to an admin instead of pretending it was sent.
 */
export async function sendSystemMail(msg: OutgoingMail): Promise<MailResult> {
  const sender = await senderFor(msg.category ?? "system", msg.mailbox);
  const headers: Record<string, string> = {};
  if (msg.inReplyTo) headers["In-Reply-To"] = msg.inReplyTo;
  if (msg.references) headers["References"] = msg.references;
  let failure: string | undefined;
  try {
    if (process.env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(sender.replyTo ? { reply_to: sender.replyTo } : {}), ...(Object.keys(headers).length ? { headers } : {}) }),
      });
      const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!r.ok) throw new Error(`Resend ${r.status}${body.message ? `: ${clip(String(body.message), 160)}` : ""}`);
      const providerId = body.id ?? null;
      const messageId = await logOutgoing(msg, sender, { delivery: "SENT", providerId });
      return { delivered: true, via: "resend", providerId, messageId };
    }
    if (process.env.SMTP_HOST) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      const info = await transport.sendMail({ from: sender.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: sender.replyTo ?? undefined, headers });
      const messageId = await logOutgoing(msg, sender, { delivery: "SENT", providerId: info?.messageId ? String(info.messageId) : null });
      return { delivered: true, via: "smtp", messageId };
    }
  } catch (e) {
    failure = (e as Error).message;
    console.error("[mail] delivery failed:", failure);
  }
  if (!failure && process.env.NODE_ENV !== "test") console.log(`[mail:not-sent] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  const messageId = await logOutgoing(msg, sender, failure ? { delivery: "FAILED", detail: clip(failure, 300) } : { delivery: "NOT_SENT", detail: "No mail provider is configured (set RESEND_API_KEY)." });
  return { delivered: false, via: "log", messageId };
}
