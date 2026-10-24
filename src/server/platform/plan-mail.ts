import "server-only";
import { platformDb } from "./client";
import { renderMail, sendSystemMail, workspaceUrl } from "./mail";
import { entitlementsFor } from "./plans";
import { getPlatformSettings } from "./settings";

export type PlanMailKind =
  | "trial-started" // a new company just began its free trial
  | "plan-active" // a plan is now active (card payment, confirmed transfer, or granted by an administrator)
  | "payment-submitted" // a bank/wallet reference was received and is waiting to be checked
  | "plan-updated"; // an administrator changed the plan or the trial

const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: process.env.APP_TIMEZONE || "Asia/Karachi" }) : "");
const num = (n: number | null) => (n === null ? "unlimited" : n.toLocaleString("en-US"));
const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-US")}`;

/**
 * Emails the workspace owner what their plan includes and what happens next. Never throws: a mail problem must not
 * undo a signup, a payment or an administrator's change. Returns whether the message was actually delivered.
 */
export async function sendPlanEmail(tenantId: string, kind: PlanMailKind, extra: { invoiceNumber?: number; amount?: number; currency?: string; reference?: string; planKey?: string; interval?: "MONTH" | "YEAR"; note?: string } = {}): Promise<boolean> {
  try {
    const t = await platformDb().tenant.findUnique({ where: { id: tenantId } });
    if (!t?.ownerEmail || t.isLegacy) return false;
    const planKey = extra.planKey ?? t.planKey;
    const plan = planKey ? await platformDb().plan.findUnique({ where: { key: planKey } }) : null;
    const ent = await entitlementsFor({ id: t.id, isLegacy: false, planKey });
    const settings = await getPlatformSettings();
    const first = (t.ownerName ?? "there").split(" ")[0];
    const interval = extra.interval ?? t.interval;
    const per = interval === "YEAR" ? "year" : "month";

    const planLine = plan ? `${plan.name} plan${plan.description ? ` — ${plan.description}` : ""}` : "your plan";
    const includes = [
      `${num(ent.maxUsers)} staff logins · ${num(ent.maxDealerships)} dealerships · ${num(ent.maxContacts)} contacts · ${ent.maxStorageMb === null ? "unlimited" : `${(ent.maxStorageMb / 1024).toFixed(ent.maxStorageMb % 1024 ? 1 : 0)} GB`} storage`,
      `Procurement & inventory: ${ent.procurement ? "included" : "not included"} · AI assistant: ${ent.assistant ? "included" : "not included"} · API access: ${ent.apiAccess ? "included" : "not included"}`,
      ...(Array.isArray(plan?.features) ? (plan!.features as string[]).slice(0, 8).map((f) => `• ${f}`) : []),
    ];
    const support = [settings.support.email, settings.support.phone].filter(Boolean).join(" · ");
    const footer = `Workspace: ${t.name} (code ${t.slug})${support ? ` · Questions? ${support}` : ""}`;
    const cta = { label: "Open Plan & billing", url: workspaceUrl(t.slug, "/crm/billing") };

    let subject: string;
    let heading: string;
    let lines: string[];
    if (kind === "trial-started") {
      subject = `Your ${settings.trialDays}-day free trial has started`;
      heading = `Welcome, ${first} — your free trial is on`;
      lines = [
        `Your workspace "${t.name}" is ready. You are on the ${planLine}, free until ${fmtDate(t.trialEndsAt)}.`,
        "What your plan includes:",
        ...includes,
        `Sign in any time with workspace code "${t.slug}" at ${workspaceUrl(t.slug, "/login")}.`,
        `What happens next: we will remind you before the trial ends. When it ends the workspace becomes read-only — nothing is deleted — until you choose a plan under Plan & billing. No card is needed to start.`,
      ];
    } else if (kind === "payment-submitted") {
      subject = "We received your payment details";
      heading = "Payment received for checking";
      lines = [
        `Thank you, ${first}. We received your transaction reference${extra.reference ? ` (${extra.reference})` : ""}${extra.amount ? ` for ${money(extra.amount, extra.currency ?? t.currency)}` : ""} for the ${planLine}, billed ${interval === "YEAR" ? "yearly" : "monthly"}.`,
        "We check that the money has arrived and then activate your plan — you will get another email as soon as it is active. Your workspace keeps working as it is in the meantime.",
        "Once active, your plan includes:",
        ...includes,
      ];
    } else if (kind === "plan-active") {
      subject = `Your ${plan?.name ?? "plan"} plan is active`;
      heading = "Your plan is active";
      lines = [
        `Thank you, ${first}. You are on the ${planLine}, billed ${interval === "YEAR" ? "yearly" : "monthly"}${t.priceAmount ? ` at ${money(t.priceAmount, t.priceCurrency)} per ${per}` : ""}.`,
        ...(extra.amount !== undefined && extra.invoiceNumber ? [`We received ${money(extra.amount, extra.currency ?? t.currency)}. Invoice INV-${String(extra.invoiceNumber).padStart(5, "0")} is available under Plan & billing.`] : []),
        `Your current period runs ${t.currentPeriodStart ? `from ${fmtDate(t.currentPeriodStart)} ` : ""}until ${fmtDate(t.currentPeriodEnd)}.`,
        "What your plan includes:",
        ...includes,
        "Before the period ends we will email you a reminder so access is never interrupted.",
      ];
    } else {
      subject = "Your plan was updated";
      heading = "Your plan was updated";
      lines = [
        `Hello ${first}, an administrator updated your workspace${extra.note ? `: ${extra.note}` : "."}`,
        `Plan: ${planLine}. Status: ${t.subStatus.toLowerCase().replace("_", " ")}.`,
        ...(t.subStatus === "TRIALING" && t.trialEndsAt ? [`Your free trial now runs until ${fmtDate(t.trialEndsAt)}.`] : []),
        ...(t.subStatus === "ACTIVE" && t.currentPeriodEnd ? [`Your plan is active until ${fmtDate(t.currentPeriodEnd)}.`] : []),
        "What your plan includes:",
        ...includes,
      ];
    }
    const mail = renderMail({ heading, paragraphs: lines, cta, footer });
    const sent = await sendSystemMail({ to: t.ownerEmail, subject, text: mail.text, html: mail.html });
    return sent.delivered;
  } catch (e) {
    console.error("[plan-mail] failed:", (e as Error).message);
    return false;
  }
}
