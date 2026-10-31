import "server-only";
import { platformDb } from "./client";
import { loadMailConfig } from "./mail-config";
import { appBaseUrl, sendSystemMail, type MailResult } from "./mail";
import { layoutMail } from "./mail-layout";
import { interpolate, templateDef, type TemplateDef, type MailTemplateKey, REQUIRED_TEMPLATES } from "./mail-templates";

export type ResolvedTemplate = { def: TemplateDef; subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; isEnabled: boolean; customised: boolean };

/** The wording in force for a template: the operator's edit if there is one, otherwise the built-in text. */
export async function resolveTemplate(key: string): Promise<ResolvedTemplate> {
  const def = templateDef(key);
  if (!def) throw new Error(`Unknown email template "${key}"`);
  const row = await platformDb().mailTemplate.findUnique({ where: { key } });
  if (!row) return { def, subject: def.subject, heading: def.heading, body: def.body, ctaLabel: def.ctaLabel, ctaUrl: def.ctaUrl, isEnabled: true, customised: false };
  return { def, subject: row.subject, heading: row.heading, body: row.body, ctaLabel: row.ctaLabel, ctaUrl: row.ctaUrl, isEnabled: row.isEnabled || REQUIRED_TEMPLATES.has(key), customised: true };
}

/** Fills a template with values and wraps it in the company-branded layout. Pure of side effects (used for previews too). */
export async function renderTemplate(key: string, vars: Record<string, string | number | null | undefined>, override?: Partial<Pick<ResolvedTemplate, "subject" | "heading" | "body" | "ctaLabel" | "ctaUrl">>) {
  const t = { ...(await resolveTemplate(key)), ...override };
  const cfg = await loadMailConfig();
  const all = { platformName: cfg.brand.companyName, supportEmail: cfg.brand.supportEmail, ...vars };
  const paragraphs = interpolate(t.body, all).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const cta = t.ctaLabel.trim() && t.ctaUrl.trim() ? { label: interpolate(t.ctaLabel, all), url: interpolate(t.ctaUrl, all).trim() } : undefined;
  const footer = t.def.footer ? interpolate(t.def.footer, all) : undefined;
  const subject = interpolate(t.subject, all).replace(/\s+/g, " ").trim();
  const heading = interpolate(t.heading, all).trim();
  const mail = layoutMail(cfg.brand, appBaseUrl(), { heading, paragraphs, cta, footer });
  return { subject, ...mail, def: t.def, isEnabled: t.isEnabled };
}

/** Renders a template and sends it from the identity chosen for its category. A switched-off template sends nothing. */
export async function sendTemplate(key: MailTemplateKey, to: string, vars: Record<string, string | number | null | undefined>, ctx: { tenantId?: string | null; sentByEmail?: string | null } = {}): Promise<MailResult> {
  const m = await renderTemplate(key, vars);
  if (!m.isEnabled) return { delivered: false, via: "log" };
  return sendSystemMail({ to, subject: m.subject, text: m.text, html: m.html, category: m.def.category, templateKey: key, sensitive: m.def.sensitive, tenantId: ctx.tenantId, sentByEmail: ctx.sentByEmail });
}
