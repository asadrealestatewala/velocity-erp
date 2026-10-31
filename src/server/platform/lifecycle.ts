import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformDb } from "./client";
import { addDays, changeSubscription } from "./subscriptions";
import { renderMail, sendSystemMail, workspaceUrl } from "./mail";
import { sendTemplate } from "./mail-send";
import { getPlatformSettings } from "./settings";

export type LifecycleSummary = { checked: number; trialsExpired: number; pastDue: number; expired: number; remindersSent: number };

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Each reminder is recorded first (unique key per workspace), so running the job twice — or two instances at once — can never email twice. */
async function once(tenantId: string, key: string): Promise<boolean> {
  const r = await platformDb().lifecycleNotice.createMany({ data: [{ tenantId, key }], skipDuplicates: true });
  return r.count === 1;
}

async function email(t: Tenant, subject: string, heading: string, lines: string[], cta = "Open Plan & billing") {
  if (!t.ownerEmail) return;
  const mail = await renderMail({ heading, paragraphs: lines, cta: { label: cta, url: workspaceUrl(t.slug, "/crm/billing") }, footer: `Workspace: ${t.name} (${t.slug})` });
  await sendSystemMail({ to: t.ownerEmail, subject, category: "billing", tenantId: t.id, text: mail.text, html: mail.html });
}

/**
 * Hourly/daily housekeeping for subscriptions. Idempotent.
 *  trial ended            → EXPIRED (read-only)
 *  paid period ended      → PAST_DUE with a grace period
 *  grace over / cancelled period over → EXPIRED
 * plus trial and renewal reminders. Nothing is ever deleted.
 */
export async function runLifecycle(now = new Date()): Promise<LifecycleSummary> {
  const db = platformDb();
  const settings = await getPlatformSettings();
  const out: LifecycleSummary = { checked: 0, trialsExpired: 0, pastDue: 0, expired: 0, remindersSent: 0 };
  const tenants = await db.tenant.findMany({ where: { isLegacy: false, status: "ACTIVE", subStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] } } });
  out.checked = tenants.length;
  const plans = new Map((await db.plan.findMany()).map((p) => [p.key, p]));

  for (const t of tenants) {
    if (t.subStatus === "TRIALING" && t.trialEndsAt) {
      if (t.trialEndsAt <= now) {
        await changeSubscription(t.id, { subStatus: "EXPIRED" }, { source: "SYSTEM", reason: "Free trial ended" });
        out.trialsExpired++;
        if (await once(t.id, `trial-ended:${ymd(t.trialEndsAt)}`)) {
          await email(t, "Your free trial has ended", "Your free trial has ended", ["Your workspace is now read-only. Nothing has been deleted — you can still sign in, view and export everything.", "Choose a plan to start editing again."], "Choose a plan");
          out.remindersSent++;
        }
        continue;
      }
      const daysLeft = Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / DAY);
      if (settings.reminderDays.includes(daysLeft) && (await once(t.id, `trial:${daysLeft}:${ymd(t.trialEndsAt)}`))) {
        const when = daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
        if (t.ownerEmail) await sendTemplate("trial-ending", t.ownerEmail, { name: (t.ownerName ?? "there").split(" ")[0], workspaceName: t.name, when, trialEndsAt: ymd(t.trialEndsAt), billingUrl: workspaceUrl(t.slug, "/crm/billing") }, { tenantId: t.id });
        out.remindersSent++;
      }
      continue;
    }

    if (t.subStatus === "ACTIVE" && t.currentPeriodEnd) {
      if (t.currentPeriodEnd <= now) {
        const grace = plans.get(t.planKey ?? "")?.graceDays ?? settings.graceDays;
        await changeSubscription(t.id, { subStatus: "PAST_DUE", graceUntil: addDays(now, grace) }, { source: "SYSTEM", reason: `Renewal payment not received; ${grace}-day grace period started` });
        out.pastDue++;
        if (await once(t.id, `past-due:${ymd(t.currentPeriodEnd)}`)) {
          await email(t, "Payment is overdue", "Your renewal payment is overdue", [`Your plan period ended on ${ymd(t.currentPeriodEnd)}. You have ${grace} days to pay before the workspace becomes read-only.`], "Pay now");
          out.remindersSent++;
        }
        continue;
      }
      const daysLeft = Math.ceil((t.currentPeriodEnd.getTime() - now.getTime()) / DAY);
      if (daysLeft <= 3 && !t.cancelAtPeriodEnd && !t.stripeSubscriptionId && (await once(t.id, `renew:${ymd(t.currentPeriodEnd)}`))) {
        await email(t, "Your plan renews soon", "Your plan is due for renewal", [`Your ${t.planKey ?? "current"} plan runs until ${ymd(t.currentPeriodEnd)}. Pay for the next period before then to avoid interruption.`], "Renew now");
        out.remindersSent++;
      }
      continue;
    }

    if (t.subStatus === "PAST_DUE" && (!t.graceUntil || t.graceUntil <= now)) {
      await changeSubscription(t.id, { subStatus: "EXPIRED" }, { source: "SYSTEM", reason: "Grace period ended without payment" });
      out.expired++;
      continue;
    }
    if (t.subStatus === "CANCELED" && (!t.currentPeriodEnd || t.currentPeriodEnd <= now)) {
      await changeSubscription(t.id, { subStatus: "EXPIRED" }, { source: "SYSTEM", reason: "Cancelled subscription reached the end of its paid period" });
      out.expired++;
    }
  }
  return out;
}
