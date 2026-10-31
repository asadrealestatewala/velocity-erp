"use server";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { sendPlanEmail } from "@/server/platform/plan-mail";
import { clearEntitlementCache } from "@/server/platform/plans";
import { addDays, changeSubscription } from "@/server/platform/subscriptions";
import { invalidateTenant } from "@/server/platform/tenants";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Tick at least one workspace").max(50, "Select at most 50 at a time"),
  days: z.coerce.number().int().min(1, "Enter 1 or more days").max(90, "At most 90 days at once"),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

/**
 * Extends the free trial of every selected workspace that is currently on a trial. Others are skipped and reported, never changed.
 * Each workspace gets its own history entry and audit line, exactly as if extended one by one.
 */
export async function bulkExtendTrialAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const a = await requireAdminAction("trials.manage");
    const v = schema.parse(input);
    const rows = await platformDb().tenant.findMany({ where: { id: { in: v.ids }, isLegacy: false } });
    if (!rows.length) throw new AppError("None of the selected workspaces can be changed.", "VALIDATION");
    let done = 0;
    const skipped: string[] = [];
    for (const t of rows) {
      if (t.subStatus !== "TRIALING" || !t.trialEndsAt) { skipped.push(t.slug); continue; }
      await changeSubscription(t.id, { trialEndsAt: addDays(t.trialEndsAt, v.days) }, { source: "ADMIN", actor: a.email, reason: `Trial extend (bulk): ${v.reason}` });
      invalidateTenant(t.slug);
      await sendPlanEmail(t.id, "plan-updated", { note: `your free trial was extended by ${v.days} day(s)` }).catch(() => {});
      await platformAudit({ admin: a, action: "trial.extend", targetType: "Tenant", targetId: t.id, reason: v.reason, detail: { days: v.days, bulk: true } });
      done++;
    }
    clearEntitlementCache();
    return { ok: true as const, message: `Extended ${done} trial${done === 1 ? "" : "s"} by ${v.days} day${v.days === 1 ? "" : "s"}.${skipped.length ? ` Skipped (not on a trial): ${skipped.join(", ")}.` : ""}` };
  });
}
