import "server-only";
import { DEFAULT_SLUG } from "./tenants";

/** Public base URL of the platform (no trailing slash). */
export const appBaseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Link into a workspace. The default workspace keeps its plain URLs; every other company is addressed as /w/<code>/… */
export const workspaceUrl = (slug: string, path = "/") => `${appBaseUrl()}${slug === DEFAULT_SLUG ? "" : `/w/${slug}`}${path.startsWith("/") ? path : `/${path}`}`;

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);

export type MailResult = { delivered: boolean; via: "resend" | "smtp" | "log" };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One branded, accessible layout for every system email (plain-text alternative always included). */
export function renderMail(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string }) {
  const brand = process.env.PLATFORM_NAME || "YADEA CRM";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f1;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1a1411">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e8e1da">
<tr><td style="padding:20px 28px;background:#150f0d;color:#fff;font-weight:700;font-size:18px">${esc(brand)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px">${esc(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.55;font-size:15px">${esc(p)}</p>`).join("")}
${opts.cta ? `<p style="margin:22px 0"><a href="${esc(opts.cta.url)}" style="background:#d6307a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(opts.cta.label)}</a></p><p style="margin:0 0 8px;font-size:12px;color:#6f645c">If the button does not work, paste this link into your browser:<br>${esc(opts.cta.url)}</p>` : ""}
${opts.footer ? `<p style="margin:18px 0 0;font-size:12px;color:#6f645c">${esc(opts.footer)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [opts.heading, "", ...opts.paragraphs, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : []), ...(opts.footer ? ["", opts.footer] : [])].join("\n");
  return { html, text };
}

/**
 * Sends a system email through Resend (RESEND_API_KEY) or SMTP (SMTP_HOST). With neither configured the message is
 * written to the server log and `delivered:false` is returned, so callers can show the link to an admin instead of
 * pretending it was sent.
 */
export async function sendSystemMail(msg: { to: string; subject: string; text: string; html?: string }): Promise<MailResult> {
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM || "YADEA CRM <no-reply@example.com>";
  try {
    if (process.env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}`);
      return { delivered: true, via: "resend" };
    }
    if (process.env.SMTP_HOST) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return { delivered: true, via: "smtp" };
    }
  } catch (e) {
    console.error("[mail] delivery failed:", (e as Error).message);
  }
  if (process.env.NODE_ENV !== "test") console.log(`[mail:not-sent] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  return { delivered: false, via: "log" };
}
