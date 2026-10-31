import "server-only";
import type { MailInboxStatus, MailMessage, PlatformRole } from "@yadea/platform-client";
import { AppError } from "@/server/errors";
import { platformDb } from "./client";
import { decryptSecret } from "./crypto";
import { appBaseUrl, sendSystemMail } from "./mail";
import { loadMailConfig, senderFor } from "./mail-config";
import { esc } from "./mail-layout";
import { DELIVERY_FROM_EVENT, deliveryAdvances, htmlToText, parseAddress, threadKeyFor, type ResendEvent } from "./mail-webhook";

/** Which console inboxes a platform role may open: owners all, billing staff billing@, support staff support@. */
export function mailboxesForRole(role: PlatformRole): string[] | "all" {
  if (role === "OWNER") return "all";
  if (role === "BILLING") return ["billing"];
  if (role === "SUPPORT") return ["support"];
  return [];
}

export const canOpenMailbox = (role: PlatformRole, mailboxKey: string) => {
  const m = mailboxesForRole(role);
  return m === "all" || m.includes(mailboxKey);
};

/** The webhook signing secret: RESEND_WEBHOOK_SECRET, or the one saved (encrypted) in Mail → Mailboxes. */
export async function webhookSecret(): Promise<string> {
  if (process.env.RESEND_WEBHOOK_SECRET) return process.env.RESEND_WEBHOOK_SECRET;
  const row = await platformDb().siteSetting.findUnique({ where: { key: "mail" } });
  const enc = (row?.value as { webhookSecretEnc?: string } | null)?.webhookSecretEnc;
  try {
    return enc ? decryptSecret(enc) : "";
  } catch {
    return "";
  }
}

export const webhookEndpoint = () => `${appBaseUrl()}/api/platform/mail/webhook/resend`;

type Received = { text: string; messageId: string | null };

/** Resend delivers only the envelope in the webhook; the body is fetched with the API key. */
async function fetchReceived(emailId: string): Promise<Received | null> {
  if (!process.env.RESEND_API_KEY) return null;
  const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!r.ok) throw new Error(`Resend ${r.status} while reading received email`);
  const j = (await r.json()) as { text?: string | null; html?: string | null; message_id?: string | null; headers?: Record<string, string> };
  const text = (j.text && j.text.trim()) || (j.html ? htmlToText(j.html) : "");
  return { text: text.slice(0, 50_000), messageId: j.message_id ?? j.headers?.["message-id"] ?? j.headers?.["Message-ID"] ?? null };
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

/** Applies one verified Resend event. Idempotent: replays and out-of-order deliveries are safe. */
export async function handleResendEvent(ev: ResendEvent): Promise<"stored" | "duplicate" | "updated" | "ignored"> {
  const db = platformDb();
  const d = ev.data ?? {};
  const emailId = typeof d.email_id === "string" ? d.email_id : "";
  if (!emailId) return "ignored";

  if (ev.type === "email.received") {
    if (await db.mailMessage.findUnique({ where: { direction_providerId: { direction: "INBOUND", providerId: emailId } }, select: { id: true } })) return "duplicate";
    const { name, address: from } = parseAddress(String(d.from ?? ""));
    if (!from) return "ignored";
    const cfg = await loadMailConfig();
    const to = asList(d.to).map((x) => parseAddress(x).address);
    const box = cfg.mailboxes.find((m) => m.receives && to.includes(m.address.toLowerCase())) ?? cfg.mailboxes.find((m) => m.key === "support")!;
    const body = await fetchReceived(emailId); // throws on an API error → 500 → Resend retries later
    const subject = String(d.subject ?? "").slice(0, 300) || "(no subject)";
    const tenant = await db.tenant.findFirst({ where: { ownerEmail: { equals: from, mode: "insensitive" } }, select: { id: true } });
    try {
      await db.mailMessage.create({
        data: {
          direction: "INBOUND", mailboxKey: box.key, fromAddress: from, fromName: name, toAddress: to.find((t) => t === box.address.toLowerCase()) ?? to[0] ?? box.address, subject,
          bodyText: body?.text ?? "(The message body could not be loaded: RESEND_API_KEY is not set on the server.)", providerId: emailId, messageIdHeader: body?.messageId ?? (typeof d.message_id === "string" ? d.message_id : null),
          threadKey: threadKeyFor(box.key, from, subject), tenantId: tenant?.id ?? null, inboxStatus: "NEW",
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "duplicate";
      throw e;
    }
    return "stored";
  }

  const next = DELIVERY_FROM_EVENT[ev.type];
  if (!next) return "ignored";
  const row = await db.mailMessage.findUnique({ where: { direction_providerId: { direction: "OUTBOUND", providerId: emailId } } });
  if (!row || !deliveryAdvances(row.delivery, next)) return "ignored";
  const bounce = d.bounce as { message?: string; type?: string } | undefined;
  const detail = typeof bounce?.message === "string" ? bounce.message : typeof d.reason === "string" ? d.reason : null;
  await db.mailMessage.update({ where: { id: row.id }, data: { delivery: next, deliveryDetail: detail ? detail.slice(0, 300) : row.deliveryDetail } });
  return "updated";
}

export async function listInbox(role: PlatformRole, opts: { mailbox?: string; status?: MailInboxStatus | "ALL"; take?: number } = {}) {
  const allowed = mailboxesForRole(role);
  const where = {
    direction: "INBOUND" as const,
    ...(allowed === "all" ? {} : { mailboxKey: { in: allowed } }),
    ...(opts.mailbox ? { mailboxKey: opts.mailbox } : {}),
    ...(opts.status && opts.status !== "ALL" ? { inboxStatus: opts.status } : {}),
  };
  // Narrow to what the role may open even when a mailbox filter is given.
  const rows = await platformDb().mailMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.take ?? 100 });
  return allowed === "all" || !opts.mailbox ? rows : rows.filter((r) => allowed.includes(r.mailboxKey));
}

/** One conversation: every received and sent message with the same thread key, oldest first. */
export async function getThread(id: string, role: PlatformRole): Promise<{ message: MailMessage; thread: MailMessage[] } | null> {
  const db = platformDb();
  const message = await db.mailMessage.findUnique({ where: { id } });
  if (!message || !canOpenMailbox(role, message.mailboxKey)) return null;
  const thread = await db.mailMessage.findMany({ where: { threadKey: message.threadKey }, orderBy: { createdAt: "asc" } });
  return { message, thread };
}

export async function setInboxStatus(id: string, status: MailInboxStatus, role: PlatformRole) {
  const m = await platformDb().mailMessage.findUnique({ where: { id } });
  if (!m || m.direction !== "INBOUND" || !canOpenMailbox(role, m.mailboxKey)) throw new AppError("That message was not found.", "NOT_FOUND");
  // The whole conversation moves together.
  await platformDb().mailMessage.updateMany({ where: { threadKey: m.threadKey, direction: "INBOUND" }, data: { inboxStatus: status } });
}

export async function markRead(id: string) {
  await platformDb().mailMessage.updateMany({ where: { id, direction: "INBOUND", readAt: null }, data: { readAt: new Date() } });
}

/** Writes a reply from the mailbox the message came to, threaded under the original. Returns whether it was delivered. */
export async function replyToMessage(id: string, body: string, admin: { email: string; name: string }, role: PlatformRole): Promise<{ delivered: boolean }> {
  const db = platformDb();
  const orig = await db.mailMessage.findUnique({ where: { id } });
  if (!orig || orig.direction !== "INBOUND" || !canOpenMailbox(role, orig.mailboxKey)) throw new AppError("That message was not found.", "NOT_FOUND");
  const text = body.trim();
  if (text.length < 2) throw new AppError("Write a reply first.", "VALIDATION", { body: "Write a reply." });
  if (text.length > 20_000) throw new AppError("That reply is too long.", "VALIDATION", { body: "Keep it under 20,000 characters." });
  const sender = await senderFor("support", orig.mailboxKey);
  const cfg = await loadMailConfig();
  const signature = sender.signature.trim();
  const plain = [text, signature && `\n${signature}`, `\n--\n${cfg.brand.companyName}${cfg.brand.addressLine ? `\n${cfg.brand.addressLine}` : ""}`, `\n\nOn ${orig.createdAt.toUTCString()}, ${orig.fromName ? `${orig.fromName} <${orig.fromAddress}>` : orig.fromAddress} wrote:\n${orig.bodyText.split("\n").map((l) => `> ${l}`).join("\n")}`].filter(Boolean).join("\n");
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1411"><div style="white-space:pre-line">${esc(text)}</div>${signature ? `<p style="white-space:pre-line;margin:18px 0 0">${esc(signature)}</p>` : ""}<p style="margin:18px 0 0;font-size:12px;color:#6f645c">${esc(cfg.brand.companyName)}${cfg.brand.addressLine ? ` · ${esc(cfg.brand.addressLine)}` : ""}</p><blockquote style="margin:18px 0 0;padding-left:12px;border-left:3px solid #e8e1da;color:#6f645c;white-space:pre-line">${esc(orig.bodyText.slice(0, 5000))}</blockquote></div>`;
  const subject = /^\s*re\s*:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
  const res = await sendSystemMail({
    to: orig.fromAddress, subject, text: plain, html, category: "support", mailbox: orig.mailboxKey, tenantId: orig.tenantId, sentByEmail: admin.email,
    inReplyTo: orig.messageIdHeader, references: orig.messageIdHeader, threadKey: orig.threadKey,
  });
  if (res.delivered) await db.mailMessage.updateMany({ where: { threadKey: orig.threadKey, direction: "INBOUND", inboxStatus: "NEW" }, data: { inboxStatus: "OPEN" } });
  return { delivered: res.delivered };
}

export async function listSent(opts: { mailbox?: string; take?: number; role: PlatformRole }) {
  const allowed = mailboxesForRole(opts.role);
  return platformDb().mailMessage.findMany({
    where: { direction: "OUTBOUND", ...(allowed === "all" ? {} : { mailboxKey: { in: allowed } }), ...(opts.mailbox ? { mailboxKey: opts.mailbox } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  });
}
