/**
 * Built-in email templates (pure data + string helpers, no database). An operator can override the wording of any
 * template in the platform console (MailTemplate row); the variables a template may use are fixed per template.
 * Body syntax: paragraphs separated by a blank line; {{variable}} is replaced with plain text (escaped when rendered as HTML).
 */
export type MailCategory = "onboarding" | "auth" | "billing" | "support" | "system";

export const MAIL_CATEGORIES: { key: MailCategory; label: string; description: string; defaultMailbox: string }[] = [
  { key: "onboarding", label: "Onboarding", description: "Welcome, email confirmation, trial and invitation emails.", defaultMailbox: "no-reply" },
  { key: "auth", label: "Sign-in & security", description: "Password resets and security notices.", defaultMailbox: "no-reply" },
  { key: "billing", label: "Billing", description: "Receipts, payment problems, renewals and plan changes.", defaultMailbox: "billing" },
  { key: "support", label: "Support replies", description: "Replies written by staff from the console inbox.", defaultMailbox: "support" },
  { key: "system", label: "System", description: "Operator notifications and anything else.", defaultMailbox: "no-reply" },
];

export type MailTemplateKey = "welcome" | "confirm-email" | "trial-started" | "trial-ending" | "invite" | "payment-receipt" | "payment-failed" | "password-reset";

export type TemplateDef = {
  key: MailTemplateKey;
  name: string;
  description: string;
  category: MailCategory;
  variables: { name: string; sample: string; help: string }[];
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
  /** The email carries a one-time link: the sent log does not keep its body. */
  sensitive?: boolean;
};

const v = (name: string, sample: string, help: string) => ({ name, sample, help });

export const TEMPLATES: TemplateDef[] = [
  {
    key: "welcome",
    name: "Welcome",
    description: "Sent to the owner once their email address is confirmed.",
    category: "onboarding",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("workspaceCode", "mia-motors", "Workspace sign-in code"), v("loginUrl", "https://velocityerp.co/w/mia-motors/login", "Sign-in link")],
    subject: "Welcome to {{platformName}}, {{name}}",
    heading: "Welcome aboard, {{name}}!",
    body: "Your email is confirmed and {{workspaceName}} is ready to use.\n\nSign in any time with the workspace code \"{{workspaceCode}}\".\n\nA good first step is to invite your team and add your dealerships and stock.",
    ctaLabel: "Sign in to {{workspaceName}}",
    ctaUrl: "{{loginUrl}}",
  },
  {
    key: "confirm-email",
    sensitive: true,
    name: "Confirm email address",
    description: "Sent at sign-up and when the owner asks for the confirmation link again.",
    category: "onboarding",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("workspaceCode", "mia-motors", "Workspace sign-in code"), v("confirmUrl", "https://velocityerp.co/confirm-email/abc123", "One-time confirmation link"), v("trialLine", "Your 7-day free trial has started.", "Trial sentence (empty when there is no trial)")],
    subject: "Confirm your email — your workspace is ready",
    heading: "Welcome to {{platformName}}, {{name}}!",
    body: "Your workspace \"{{workspaceName}}\" is ready. {{trialLine}}\n\nSign in any time with your workspace code \"{{workspaceCode}}\".\n\nPlease confirm your email address so you can invite your team.",
    ctaLabel: "Confirm my email",
    ctaUrl: "{{confirmUrl}}",
    footer: "This link works once and expires in 3 days. If you did not create this workspace, you can ignore this email.",
  },
  {
    key: "trial-started",
    name: "Trial started",
    description: "Sent when a free trial begins, with what the plan includes.",
    category: "onboarding",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("workspaceCode", "mia-motors", "Workspace sign-in code"), v("planName", "Growth", "Plan used for the trial"), v("trialDays", "7", "Trial length in days"), v("trialEndsAt", "7 November 2026", "Date the trial ends"), v("includes", "5 staff logins · 2 dealerships · 5,000 contacts", "What the plan includes (generated)"), v("billingUrl", "https://velocityerp.co/w/mia-motors/crm/billing", "Plan & billing link")],
    subject: "Your {{trialDays}}-day free trial has started",
    heading: "Welcome, {{name}} — your free trial is on",
    body: "Your workspace \"{{workspaceName}}\" is ready. You are on the {{planName}} plan, free until {{trialEndsAt}}.\n\nWhat your plan includes:\n{{includes}}\n\nWhat happens next: we will remind you before the trial ends. When it ends the workspace becomes read-only — nothing is deleted — until you choose a plan under Plan & billing. No card is needed to start.",
    ctaLabel: "Open Plan & billing",
    ctaUrl: "{{billingUrl}}",
    footer: "Workspace: {{workspaceName}} (code {{workspaceCode}})",
  },
  {
    key: "trial-ending",
    name: "Trial ending soon",
    description: "Reminder sent a few days (see Settings) before the free trial ends.",
    category: "billing",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("when", "in 3 days", "When it ends: \"today\", \"tomorrow\" or \"in 3 days\""), v("trialEndsAt", "7 November 2026", "Date the trial ends"), v("billingUrl", "https://velocityerp.co/w/mia-motors/crm/billing", "Plan & billing link")],
    subject: "Your free trial ends {{when}}",
    heading: "Your free trial is ending",
    body: "Hello {{name}}, the free trial of {{workspaceName}} ends {{when}}, on {{trialEndsAt}}.\n\nChoose a plan before then to keep working without interruption. If you do nothing the workspace becomes read-only — nothing is deleted.",
    ctaLabel: "Choose a plan",
    ctaUrl: "{{billingUrl}}",
  },
  {
    key: "invite",
    sensitive: true,
    name: "Team invitation",
    description: "Sent when a workspace owner or admin invites a colleague.",
    category: "onboarding",
    variables: [v("inviterName", "Mia Khan", "Who sent the invitation"), v("workspaceName", "Mia Motors", "Company name"), v("workspaceCode", "mia-motors", "Workspace sign-in code"), v("roleName", "Sales Executive", "Role they were invited as"), v("inviteUrl", "https://velocityerp.co/w/mia-motors/invite/abc123", "One-time acceptance link"), v("expiryDays", "7", "Days the link stays valid")],
    subject: "You're invited to {{workspaceName}}",
    heading: "{{inviterName}} invited you to {{workspaceName}}",
    body: "You've been invited to join the {{workspaceName}} workspace as {{roleName}}.\n\nChoose your password to get started. The link is valid for {{expiryDays}} days.",
    ctaLabel: "Accept the invitation",
    ctaUrl: "{{inviteUrl}}",
    footer: "Workspace code: {{workspaceCode}}",
  },
  {
    key: "payment-receipt",
    name: "Payment receipt / plan active",
    description: "Sent when a payment is confirmed and the plan becomes active.",
    category: "billing",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("planName", "Growth", "Plan name"), v("amount", "PKR 24,000", "Amount received"), v("invoiceNumber", "INV-00042", "Invoice number"), v("periodEnd", "7 December 2026", "Date the paid period ends"), v("includes", "5 staff logins · 2 dealerships", "What the plan includes (generated)"), v("billingUrl", "https://velocityerp.co/w/mia-motors/crm/billing", "Plan & billing link")],
    subject: "Your {{planName}} plan is active",
    heading: "Thank you — your plan is active",
    body: "Thank you, {{name}}. We received {{amount}} for the {{planName}} plan. Invoice {{invoiceNumber}} is available under Plan & billing.\n\nYour current period runs until {{periodEnd}}.\n\nWhat your plan includes:\n{{includes}}",
    ctaLabel: "Open Plan & billing",
    ctaUrl: "{{billingUrl}}",
  },
  {
    key: "payment-failed",
    name: "Payment not confirmed",
    description: "Sent when a bank/wallet payment could not be matched or a renewal failed.",
    category: "billing",
    variables: [v("name", "Mia", "Owner's first name"), v("workspaceName", "Mia Motors", "Company name"), v("reference", "TXN-88231", "Transaction reference"), v("reason", "The amount did not match the invoice.", "Why it was not confirmed"), v("billingUrl", "https://velocityerp.co/w/mia-motors/crm/billing", "Plan & billing link")],
    subject: "Payment not confirmed",
    heading: "We could not confirm your payment",
    body: "Hello {{name}}, reference {{reference}} was not confirmed: {{reason}}\n\nYou can submit the payment details again from Plan & billing. If you think this is a mistake, just reply to this email.",
    ctaLabel: "Open Plan & billing",
    ctaUrl: "{{billingUrl}}",
  },
  {
    key: "password-reset",
    sensitive: true,
    name: "Password reset",
    description: "Sent when someone asks to reset a workspace password.",
    category: "auth",
    variables: [v("email", "mia@miamotors.pk", "Account email"), v("workspaceName", "Mia Motors", "Company name"), v("resetUrl", "https://velocityerp.co/w/mia-motors/reset-password/abc123", "One-time reset link"), v("expiryHours", "2", "Hours the link stays valid")],
    subject: "Reset your password",
    heading: "Reset your password",
    body: "Someone asked to reset the password for {{email}} in the {{workspaceName}} workspace.\n\nThe link works once and expires in {{expiryHours}} hours. Using it signs you out everywhere.",
    ctaLabel: "Choose a new password",
    ctaUrl: "{{resetUrl}}",
    footer: "If you didn't ask for this, you can ignore this email — your password stays the same.",
  },
];

/** Variables every template may use (filled in automatically). */
export const GLOBAL_VARIABLES = [
  { name: "platformName", help: "Company name from Branding" },
  { name: "supportEmail", help: "Support contact email" },
] as const;

/** Account-critical emails: they can be re-worded but never switched off. */
export const REQUIRED_TEMPLATES: ReadonlySet<string> = new Set(["confirm-email", "invite", "password-reset", "payment-failed", "payment-receipt"]);

export const templateDef = (key: string) => TEMPLATES.find((t) => t.key === key);

export const allowedVariables = (def: TemplateDef) => new Set<string>([...def.variables.map((x) => x.name), ...GLOBAL_VARIABLES.map((x) => x.name)]);

/** Replaces {{name}} with plain-text values; unknown or missing names become empty. */
export function interpolate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, n: string) => String(vars[n] ?? ""));
}

/** Names used as {{name}} in a text that the template does not define (so saving a typo is rejected, not mailed). */
export function unknownVariables(def: TemplateDef, ...texts: string[]): string[] {
  const ok = allowedVariables(def);
  const bad = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)) if (!ok.has(m[1]!)) bad.add(m[1]!);
  return [...bad];
}

export const sampleVars = (def: TemplateDef): Record<string, string> => Object.fromEntries(def.variables.map((x) => [x.name, x.sample]));
