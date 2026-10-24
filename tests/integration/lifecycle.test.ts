import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { runLifecycle } from "@/server/platform/lifecycle";
import { addDays, changeSubscription } from "@/server/platform/subscriptions";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUG = "t-life-co";
const EMAIL = "owner@t-life-co.test";
let id = "";

async function cleanup() {
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await platformDb().tenant.deleteMany({ where: { slug: SLUG } });
  await platformDb().trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  invalidateTenant();
}
const reload = () => platformDb().tenant.findUniqueOrThrow({ where: { id } });
const set = (patch: Parameters<typeof changeSubscription>[1]) => changeSubscription(id, patch, { source: "ADMIN", actor: "test", reason: "setup" });
const notices = () => platformDb().lifecycleNotice.count({ where: { tenantId: id } });

beforeAll(async () => {
  await cleanup();
  id = (await createWorkspace({ slug: SLUG, companyName: "Life Co", ownerName: "Lee", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
}, 120_000);
afterAll(cleanup);

describe("subscription lifecycle job", () => {
  it("reminds exactly once as the trial nears its end", async () => {
    await set({ subStatus: "TRIALING", planKey: "growth", trialStartedAt: new Date(), trialEndsAt: addDays(new Date(), 2.5) }); // 3 days left
    const a = await runLifecycle();
    expect(a.remindersSent).toBeGreaterThanOrEqual(1);
    const before = await notices();
    const b = await runLifecycle();
    expect(b.remindersSent).toBe(0);
    expect(await notices()).toBe(before);
    expect((await reload()).subStatus).toBe("TRIALING");
  });

  it("ends an unpaid trial: read-only (EXPIRED), history recorded, one notice", async () => {
    await set({ subStatus: "TRIALING", trialEndsAt: addDays(new Date(), -1) });
    const r = await runLifecycle();
    expect(r.trialsExpired).toBe(1);
    expect((await reload()).subStatus).toBe("EXPIRED");
    const last = await platformDb().subscriptionHistory.findFirstOrThrow({ where: { tenantId: id }, orderBy: { at: "desc" } });
    expect(last).toMatchObject({ toStatus: "EXPIRED", fromStatus: "TRIALING", source: "SYSTEM" });
    expect((await runLifecycle()).trialsExpired).toBe(0); // idempotent
  });

  it("moves an unpaid renewal to PAST_DUE with the plan's grace period, then to EXPIRED when it runs out", async () => {
    await set({ subStatus: "ACTIVE", planKey: "growth", currentPeriodStart: addDays(new Date(), -31), currentPeriodEnd: addDays(new Date(), -1), graceUntil: null });
    expect((await runLifecycle()).pastDue).toBe(1);
    const t = await reload();
    expect(t.subStatus).toBe("PAST_DUE");
    expect(Math.round((t.graceUntil!.getTime() - Date.now()) / 86_400_000)).toBe(7);
    expect((await runLifecycle()).expired).toBe(0); // still inside grace

    await set({ graceUntil: addDays(new Date(), -1) });
    expect((await runLifecycle()).expired).toBe(1);
    expect((await reload()).subStatus).toBe("EXPIRED");
  });

  it("lets a cancelled subscription run to the end of the paid period, then expires it", async () => {
    await set({ subStatus: "CANCELED", currentPeriodEnd: addDays(new Date(), 5) });
    expect((await runLifecycle()).expired).toBe(0);
    await set({ currentPeriodEnd: addDays(new Date(), -1) });
    expect((await runLifecycle()).expired).toBe(1);
  });

  it("never touches the original (legacy) workspace", async () => {
    const legacy = await platformDb().tenant.findFirst({ where: { isLegacy: true } });
    if (legacy) {
      await runLifecycle();
      expect((await platformDb().tenant.findUniqueOrThrow({ where: { id: legacy.id } })).subStatus).toBe(legacy.subStatus);
    }
  });
});
