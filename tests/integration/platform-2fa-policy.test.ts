import { afterAll, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { mustEnrolTwoFactor, twoFactorRequired } from "@/server/platform/admin-auth";
import { getPlatformSettings, savePlatformSettings } from "@/server/platform/settings";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const admin = (role: "OWNER" | "BILLING" | "SUPPORT" | "ANALYTICS", totpEnabled: boolean) => ({ role, totpEnabled }) as Parameters<typeof mustEnrolTwoFactor>[0];

afterAll(async () => {
  await platformDb().siteSetting.deleteMany({ where: { key: "platform" } });
});

describe("staff two-factor policy", () => {
  it("applies by mode and role", () => {
    expect(twoFactorRequired("all", "ANALYTICS")).toBe(true);
    expect(twoFactorRequired("privileged", "OWNER")).toBe(true);
    expect(twoFactorRequired("privileged", "BILLING")).toBe(true);
    expect(twoFactorRequired("privileged", "SUPPORT")).toBe(false);
    expect(twoFactorRequired("off", "OWNER")).toBe(false);
  });

  it("is on for everyone by default, sends only un-enrolled staff to enrolment, and can be switched off", async () => {
    await platformDb().siteSetting.deleteMany({ where: { key: "platform" } });
    expect((await getPlatformSettings()).staff2fa).toBe("all");
    expect(await mustEnrolTwoFactor(admin("OWNER", false))).toBe(true);
    expect(await mustEnrolTwoFactor(admin("OWNER", true))).toBe(false);
    await savePlatformSettings({ staff2fa: "privileged" });
    expect(await mustEnrolTwoFactor(admin("SUPPORT", false))).toBe(false);
    expect(await mustEnrolTwoFactor(admin("BILLING", false))).toBe(true);
    await savePlatformSettings({ staff2fa: "off" });
    expect(await mustEnrolTwoFactor(admin("OWNER", false))).toBe(false);
  });
});
