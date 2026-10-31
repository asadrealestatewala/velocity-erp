import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { bucket, clearFlagCache, decide, flagsFor, isFeatureOn, FLAG_KEY_RE } from "@/server/platform/flags";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const flag = (o: Partial<Parameters<typeof decide>[0]> = {}) => ({ key: "new-reports", enabled: false, planKeys: [] as string[], rolloutPercent: 0, isArchived: false, ...o });
const t = { id: "tenant-a", planKey: "growth" };

describe("deciding a flag", () => {
  it("is off by default and on when switched on for everyone", () => {
    expect(decide(flag(), t)).toEqual({ on: false, why: "off" });
    expect(decide(flag({ enabled: true }), t)).toEqual({ on: true, why: "default" });
  });
  it("follows plans, then rollout", () => {
    expect(decide(flag({ planKeys: ["growth"] }), t)).toEqual({ on: true, why: "plan" });
    expect(decide(flag({ planKeys: ["enterprise"] }), t).on).toBe(false);
    expect(decide(flag({ rolloutPercent: 100 }), t)).toEqual({ on: true, why: "rollout" });
    expect(decide(flag({ rolloutPercent: 0 }), t).on).toBe(false);
  });
  it("a workspace exception beats everything, except an archived flag", () => {
    expect(decide(flag({ enabled: true }), t, false)).toEqual({ on: false, why: "override" });
    expect(decide(flag(), t, true)).toEqual({ on: true, why: "override" });
    expect(decide(flag({ enabled: true, isArchived: true }), t, true)).toEqual({ on: false, why: "archived" });
  });
  it("rollout buckets are stable, in range and roughly even", () => {
    expect(bucket("x", "f")).toBe(bucket("x", "f"));
    const ids = Array.from({ length: 2000 }, (_, i) => `tenant-${i}`);
    const inTen = ids.filter((id) => bucket(id, "f") < 10).length;
    expect(inTen).toBeGreaterThan(120);
    expect(inTen).toBeLessThan(280);
    expect(ids.every((id) => bucket(id, "f") >= 0 && bucket(id, "f") < 100)).toBe(true);
  });
  it("validates keys", () => {
    expect(FLAG_KEY_RE.test("new-reports")).toBe(true);
    expect(FLAG_KEY_RE.test("Bad Key")).toBe(false);
    expect(FLAG_KEY_RE.test("ab")).toBe(false);
  });
});

describe("flags from the database", () => {
  let tenantId = "";
  beforeEach(async () => {
    await platformDb().featureFlag.deleteMany({ where: { key: { startsWith: "t-" } } });
    await platformDb().tenant.deleteMany({ where: { slug: "t-flag-co" } });
    tenantId = (await platformDb().tenant.create({ data: { slug: "t-flag-co", name: "Flag Co", dbSchema: "t_flag_co", planKey: "growth", status: "ACTIVE" } })).id;
    clearFlagCache();
  });
  afterAll(async () => {
    await platformDb().featureFlag.deleteMany({ where: { key: { startsWith: "t-" } } });
    await platformDb().tenant.deleteMany({ where: { slug: "t-flag-co" } });
    clearFlagCache();
  });

  it("applies overrides, treats unknown flags as off, and cascades on workspace deletion", async () => {
    await platformDb().featureFlag.create({ data: { key: "t-beta", name: "Beta", enabled: false } });
    const subject = { id: tenantId, planKey: "growth" };
    expect(await isFeatureOn("t-beta", subject)).toBe(false);
    expect(await isFeatureOn("t-missing", subject)).toBe(false);
    await platformDb().tenantFlagOverride.create({ data: { tenantId, flagKey: "t-beta", enabled: true, reason: "pilot customer" } });
    clearFlagCache();
    expect(await isFeatureOn("t-beta", subject)).toBe(true);
    expect((await flagsFor(subject))["t-beta"]).toEqual({ on: true, why: "override" });
    await platformDb().tenant.delete({ where: { id: tenantId } });
    expect(await platformDb().tenantFlagOverride.count({ where: { flagKey: "t-beta" } })).toBe(0);
  });
});
