"use server";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { encryptSecret } from "@/server/platform/crypto";
import { platformRateLimit } from "@/server/platform/guard";
import { saveMailBrand, saveMailRouting, saveWebhookSecretEnc, clearMailConfigCache, loadMailConfig } from "@/server/platform/mail-config";
import { replyToMessage, setInboxStatus } from "@/server/platform/mail-inbox";
import { safeColor } from "@/server/platform/mail-layout";
import { renderTemplate } from "@/server/platform/mail-send";
import { sendSystemMail, appBaseUrl } from "@/server/platform/mail";
import { MAIL_CATEGORIES, REQUIRED_TEMPLATES, sampleVars, templateDef, unknownVariables, type MailCategory } from "@/server/platform/mail-templates";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
const optEmail = z.union([z.literal(""), email]).nullish().transform((v) => v || null);

// ───────────────────────── inbox

export async function replyAction(id: string, input: { body: string }) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.manage");
    const r = await replyToMessage(id, String(input.body ?? ""), { email: a.email, name: a.name }, a.role);
    await platformAudit({ admin: a, action: "mail.replied", targetType: "MailMessage", targetId: id, detail: { delivered: r.delivered } });
    return { ok: true as const, message: r.delivered ? "Reply sent." : "Reply saved, but no mail provider is configured so nothing was sent." };
  });
}

export async function setInboxStatusAction(id: string, input: { status: "NEW" | "OPEN" | "RESOLVED" | "SPAM" }) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.manage");
    const status = z.enum(["NEW", "OPEN", "RESOLVED", "SPAM"]).parse(input.status);
    await setInboxStatus(id, status, a.role);
    await platformAudit({ admin: a, action: "mail.status_changed", targetType: "MailMessage", targetId: id, detail: { status } });
    return { ok: true as const, message: `Marked ${status.toLowerCase()}.` };
  });
}

// ───────────────────────── templates

const templateSchema = z.object({
  subject: z.string().trim().min(1, "A subject is required").max(200),
  heading: z.string().trim().min(1, "A heading is required").max(200),
  body: z.string().trim().min(1, "The message cannot be empty").max(5000),
  ctaLabel: z.string().trim().max(80).default(""),
  ctaUrl: z.string().trim().max(500).default("").refine((u) => !u || /^(\{\{[a-zA-Z][a-zA-Z0-9]*\}\}|https:\/\/|\/)/.test(u), "Use a {{variable}}, an https:// link or a path starting with /"),
  isEnabled: z.boolean().default(true),
});

function checkTemplate(key: string, v: z.infer<typeof templateSchema>) {
  const def = templateDef(key);
  if (!def) throw new AppError("Unknown template.", "NOT_FOUND");
  const bad = unknownVariables(def, v.subject, v.heading, v.body, v.ctaLabel, v.ctaUrl);
  if (bad.length) throw new AppError(`Unknown variable${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}. Use only the variables listed beside the editor.`, "VALIDATION", { body: "Remove or fix the unknown variable." });
  if (v.ctaLabel && !v.ctaUrl) throw new AppError("A button needs a link.", "VALIDATION", { ctaUrl: "Add the link for the button, or clear the label." });
  return def;
}

export async function saveTemplateAction(key: string, input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const v = templateSchema.parse(input);
    checkTemplate(key, v);
    const isEnabled = REQUIRED_TEMPLATES.has(key) ? true : v.isEnabled;
    await platformDb().mailTemplate.upsert({ where: { key }, create: { key, ...v, isEnabled, updatedBy: a.email }, update: { ...v, isEnabled, updatedBy: a.email } });
    await platformAudit({ admin: a, action: "mail.template_saved", targetType: "MailTemplate", targetId: key });
    return { ok: true as const, message: "Template saved." };
  });
}

export async function resetTemplateAction(key: string) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    if (!templateDef(key)) throw new AppError("Unknown template.", "NOT_FOUND");
    await platformDb().mailTemplate.deleteMany({ where: { key } });
    await platformAudit({ admin: a, action: "mail.template_reset", targetType: "MailTemplate", targetId: key });
    return { ok: true as const, message: "Restored the built-in wording." };
  });
}

/** Renders the (possibly unsaved) draft with sample values, in the branded layout. */
export async function previewTemplateAction(key: string, input: Record<string, unknown>) {
  return runAction(async () => {
    await requireAdminAction("mail.settings");
    const v = templateSchema.parse(input);
    const def = checkTemplate(key, v);
    const m = await renderTemplate(key, sampleVars(def), v);
    return { ok: true as const, data: { subject: m.subject, html: m.html, text: m.text } };
  });
}

/** Sends the draft with sample values to an address the operator chooses (rate-limited), so they see it in a real inbox. */
export async function testSendTemplateAction(key: string, input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const to = email.parse(input.to ?? a.email);
    const v = templateSchema.parse(input);
    const def = checkTemplate(key, v);
    if (!(await platformRateLimit(`mailtest:${a.id}`, 20, 3600))) throw new AppError("Too many test emails. Please wait a while.", "RATE_LIMITED");
    const m = await renderTemplate(key, sampleVars(def), v);
    const sent = await sendSystemMail({ to, subject: `[Test] ${m.subject}`, text: m.text, html: m.html, category: def.category, templateKey: key, sensitive: def.sensitive, sentByEmail: a.email });
    await platformAudit({ admin: a, action: "mail.test_sent", targetType: "MailTemplate", targetId: key, detail: { delivered: sent.delivered } });
    return { ok: true as const, message: sent.delivered ? `Test email sent to ${to}.` : "Nothing was sent: no mail provider is configured (set RESEND_API_KEY)." };
  });
}

// ───────────────────────── mailboxes and routing

const mailboxSchema = z.object({
  address: email,
  displayName: z.string().trim().min(1, "A display name is required").max(80),
  replyTo: optEmail,
  signature: z.string().trim().max(500).nullish().transform((v) => v ?? ""),
  receives: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function saveMailboxAction(key: string, input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const v = mailboxSchema.parse(input);
    await loadMailConfig(); // makes sure the default mailboxes exist
    if (!(await platformDb().mailMailbox.findUnique({ where: { key } }))) throw new AppError("Mailbox not found.", "NOT_FOUND");
    if (key === "no-reply") { v.isActive = true; v.receives = false; } // the fallback sender must always work
    try {
      await platformDb().mailMailbox.update({ where: { key }, data: v });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new AppError("Another mailbox already uses that address.", "CONFLICT", { address: "Already used." });
      throw e;
    }
    clearMailConfigCache();
    await platformAudit({ admin: a, action: "mail.mailbox_saved", targetType: "MailMailbox", targetId: key, detail: { address: v.address } });
    return { ok: true as const, message: "Mailbox saved." };
  });
}

export async function saveRoutingAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const cfg = await loadMailConfig();
    const keys = new Set(cfg.mailboxes.filter((m) => m.isActive).map((m) => m.key));
    const routing = {} as Record<MailCategory, string>;
    for (const c of MAIL_CATEGORIES) {
      const k = String(input[c.key] ?? "");
      if (!keys.has(k)) throw new AppError(`Choose an active mailbox for ${c.label}.`, "VALIDATION", { [c.key]: "Choose an active mailbox." });
      routing[c.key] = k;
    }
    await saveMailRouting(routing);
    await platformAudit({ admin: a, action: "mail.routing_saved", detail: routing });
    return { ok: true as const, message: "Sender routing saved." };
  });
}

export async function saveWebhookSecretAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const secret = z.string().trim().regex(/^whsec_[A-Za-z0-9+/=_-]{16,200}$/, "The signing secret starts with whsec_").parse(input.secret);
    await saveWebhookSecretEnc(encryptSecret(secret));
    await platformAudit({ admin: a, action: "mail.webhook_secret_saved" });
    return { ok: true as const, message: "Webhook signing secret saved (stored encrypted)." };
  });
}

// ───────────────────────── branding

const brandSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(80),
  logoUrl: z.string().trim().max(500).refine((u) => !u || /^(https:\/\/[^\s"'<>]+|\/[^\s"'<>/][^\s"'<>]*)$/.test(u), "Use an https:// link or a path such as /brand/logo.png"),
  accentColor: z.string().trim().refine((c) => /^#[0-9a-fA-F]{6}$/.test(c), "Use a 6-digit hex colour such as #d6307a").transform((c) => safeColor(c)),
  addressLine: z.string().trim().max(200).default(""),
  website: z.string().trim().max(200).refine((u) => !u || /^https:\/\/[^\s"'<>]+$/.test(u), "Use a full https:// address").default(""),
  supportEmail: optEmail.transform((v) => v ?? ""),
  supportPhone: z.string().trim().max(40).default(""),
  footerNote: z.string().trim().max(200).default(""),
});

export async function saveBrandAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const a = await requireAdminAction("mail.settings");
    const v = brandSchema.parse(input);
    await saveMailBrand(v);
    await platformAudit({ admin: a, action: "mail.brand_saved", detail: { companyName: v.companyName } });
    return { ok: true as const, message: "Branding saved. New emails use it straight away." };
  });
}

/** Branded sample of the layout with the unsaved branding values, for the Branding page preview. */
export async function previewBrandAction(input: Record<string, unknown>) {
  return runAction(async () => {
    await requireAdminAction("mail.settings");
    const v = brandSchema.parse(input);
    const { layoutMail } = await import("@/server/platform/mail-layout");
    const m = layoutMail(v, appBaseUrl(), { heading: "Welcome aboard!", paragraphs: ["This is how your emails will look.", "Your logo, name, address and support contact appear on every message."], cta: { label: "Open your workspace", url: `${appBaseUrl()}/login` } });
    return { ok: true as const, data: { html: m.html } };
  });
}
