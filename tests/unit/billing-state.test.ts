import { describe, expect, it } from "vitest";
import { billingState, type TenantBillingInput } from "@/server/platform/billing-state";

const NOW = new Date("2026-10-24T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const base: TenantBillingInput = { status: "ACTIVE", isLegacy: false, subStatus: "ACTIVE", trialEndsAt: null, currentPeriodEnd: day(20), graceUntil: null };
const s = (p: Partial<TenantBillingInput>) => billingState({ ...base, ...p }, NOW);

describe("subscription access rules", () => {
  it("never meters or locks the original install", () => {
    expect(s({ isLegacy: true, subStatus: "EXPIRED" })).toMatchObject({ locked: false, blocked: false, banner: null });
  });

  it("trial: open while days remain (warning in the last week), read-only once it has ended", () => {
    expect(s({ subStatus: "TRIALING", trialEndsAt: day(10) })).toMatchObject({ locked: false, banner: null, daysLeft: 10 });
    expect(s({ subStatus: "TRIALING", trialEndsAt: day(3) })).toMatchObject({ locked: false, daysLeft: 3, banner: { tone: "info" } });
    expect(s({ subStatus: "TRIALING", trialEndsAt: day(1) })).toMatchObject({ locked: false, banner: { tone: "warn", text: expect.stringContaining("1 day") } });
    expect(s({ subStatus: "TRIALING", trialEndsAt: day(-1) })).toMatchObject({ locked: true, reason: "trial_ended" });
    expect(s({ subStatus: "TRIALING", trialEndsAt: null })).toMatchObject({ locked: true });
  });

  it("active: open until the paid period ends", () => {
    expect(s({}).locked).toBe(false);
    expect(s({ currentPeriodEnd: day(-1) })).toMatchObject({ locked: true, reason: "payment_required" });
  });

  it("past due: full access during the grace period, then read-only", () => {
    expect(s({ subStatus: "PAST_DUE", graceUntil: day(4) })).toMatchObject({ locked: false, banner: { tone: "warn" } });
    expect(s({ subStatus: "PAST_DUE", graceUntil: day(-1) })).toMatchObject({ locked: true, reason: "past_due_grace_over" });
    expect(s({ subStatus: "PAST_DUE", graceUntil: null })).toMatchObject({ locked: true });
  });

  it("cancelled subscriptions keep access until the paid period ends", () => {
    expect(s({ subStatus: "CANCELED", currentPeriodEnd: day(5) })).toMatchObject({ locked: false, banner: { tone: "info" } });
    expect(s({ subStatus: "CANCELED", currentPeriodEnd: day(-1) })).toMatchObject({ locked: true, reason: "canceled" });
  });

  it("pending and expired are read-only; suspended is blocked outright; cancelled workspaces stay readable", () => {
    expect(s({ subStatus: "PENDING" })).toMatchObject({ locked: true, blocked: false });
    expect(s({ subStatus: "EXPIRED" })).toMatchObject({ locked: true, blocked: false });
    expect(s({ status: "SUSPENDED" })).toMatchObject({ locked: true, blocked: true });
    expect(s({ subStatus: "SUSPENDED" })).toMatchObject({ locked: true, blocked: true });
    expect(s({ status: "CANCELLED" })).toMatchObject({ locked: true, blocked: false });
  });
});
