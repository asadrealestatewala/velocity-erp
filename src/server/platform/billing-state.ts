/**
 * Pure access rules for a workspace's subscription. Nothing here touches the database, so it is shared by the
 * write guard, the billing banner and the platform console, and is unit-tested directly.
 *
 * Nothing is ever deleted for non-payment: a locked workspace is READ-ONLY — people can still sign in, view and export.
 */
export type TenantBillingInput = {
  status: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  isLegacy: boolean;
  subStatus: "TRIALING" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "SUSPENDED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
};

export type BillingState = {
  /** Writes are refused (HTTP 402-style) while true. */
  locked: boolean;
  /** Sign-in is refused while true (suspended by the platform). */
  blocked: boolean;
  reason: "ok" | "trial_ended" | "payment_required" | "past_due_grace_over" | "canceled" | "expired" | "suspended" | "cancelled_workspace" | "pending";
  /** Short banner text for the workspace, or null when nothing needs attention. */
  banner: { tone: "info" | "warn" | "danger"; text: string } | null;
  daysLeft: number | null;
};

const DAY = 86_400_000;
const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

export function billingState(t: TenantBillingInput, now = new Date()): BillingState {
  // The original install (YADEA itself) is never metered.
  if (t.isLegacy && t.status === "ACTIVE") return { locked: false, blocked: false, reason: "ok", banner: null, daysLeft: null };
  if (t.status === "SUSPENDED") return { locked: true, blocked: true, reason: "suspended", banner: { tone: "danger", text: "This workspace is suspended. Contact support." }, daysLeft: null };
  if (t.status === "CANCELLED") return { locked: true, blocked: false, reason: "cancelled_workspace", banner: { tone: "danger", text: "This workspace is cancelled and read-only. You can still view and export your data." }, daysLeft: null };
  if (t.status === "PROVISIONING") return { locked: true, blocked: false, reason: "pending", banner: null, daysLeft: null };

  switch (t.subStatus) {
    case "TRIALING": {
      if (!t.trialEndsAt || t.trialEndsAt <= now)
        return { locked: true, blocked: false, reason: "trial_ended", banner: { tone: "danger", text: "Your free trial has ended. The workspace is read-only until you choose a plan." }, daysLeft: 0 };
      const left = daysUntil(t.trialEndsAt, now);
      return { locked: false, blocked: false, reason: "ok", banner: left <= 7 ? { tone: left <= 2 ? "warn" : "info", text: `Your free trial ends in ${left} day${left === 1 ? "" : "s"}. Choose a plan to keep working.` } : null, daysLeft: left };
    }
    case "ACTIVE": {
      if (t.currentPeriodEnd && t.currentPeriodEnd <= now)
        return { locked: true, blocked: false, reason: "payment_required", banner: { tone: "danger", text: "Your subscription period has ended. Renew to continue editing." }, daysLeft: 0 };
      const left = t.currentPeriodEnd ? daysUntil(t.currentPeriodEnd, now) : null;
      return { locked: false, blocked: false, reason: "ok", banner: left !== null && left <= 5 ? { tone: "info", text: `Your plan renews in ${left} day${left === 1 ? "" : "s"}.` } : null, daysLeft: left };
    }
    case "PAST_DUE": {
      if (!t.graceUntil || t.graceUntil <= now)
        return { locked: true, blocked: false, reason: "past_due_grace_over", banner: { tone: "danger", text: "Payment is overdue and the grace period is over. The workspace is read-only." }, daysLeft: 0 };
      const left = daysUntil(t.graceUntil, now);
      return { locked: false, blocked: false, reason: "ok", banner: { tone: "warn", text: `Payment is overdue. Pay within ${left} day${left === 1 ? "" : "s"} to avoid read-only mode.` }, daysLeft: left };
    }
    case "CANCELED": {
      if (!t.currentPeriodEnd || t.currentPeriodEnd <= now)
        return { locked: true, blocked: false, reason: "canceled", banner: { tone: "danger", text: "Your subscription has ended. The workspace is read-only." }, daysLeft: 0 };
      return { locked: false, blocked: false, reason: "ok", banner: { tone: "info", text: `Your subscription is cancelled and ends in ${daysUntil(t.currentPeriodEnd, now)} days.` }, daysLeft: daysUntil(t.currentPeriodEnd, now) };
    }
    case "PENDING":
      return { locked: true, blocked: false, reason: "pending", banner: { tone: "warn", text: "Choose a plan to start using your workspace." }, daysLeft: null };
    case "EXPIRED":
      return { locked: true, blocked: false, reason: "expired", banner: { tone: "danger", text: "Your subscription has expired. The workspace is read-only until you renew." }, daysLeft: 0 };
    case "SUSPENDED":
      return { locked: true, blocked: true, reason: "suspended", banner: { tone: "danger", text: "This workspace is suspended. Contact support." }, daysLeft: null };
  }
}
