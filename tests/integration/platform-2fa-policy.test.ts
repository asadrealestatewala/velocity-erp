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

  it("is off by default (no lock-out on first deploy), then sends only un-enrolled staff to enrolment once required", async () => {
    await platformDb().siteSetting.deleteMany({ where: { key: "platform" } });
    expect((await getPlatformSettings()).staff2fa).toBe("off");
    expect(await mustEnrolTwoFactor(admin("OWNER", false))).toBe(false);
    await savePlatformSettings({ staff2fa: "all" });
    expect(await mustEnrolTwoFactor(admin("OWNER", false))).toBe(true);
    expect(await mustEnrolTwoFactor(admin("OWNER", true))).toBe(false);
    await savePlatformSettings({ staff2fa: "privileged" });
    expect(await mustEnrolTwoFactor(admin("SUPPORT", false))).toBe(false);
    expect(await mustEnrolTwoFactor(admin("BILLING", false))).toBe(true);
    await savePlatformSettings({ staff2fa: "off" });
    expect(await mustEnrolTwoFactor(admin("OWNER", false))).toBe(false);
  });
});

describe("requiring two-factor", () => {
  it("is refused for an owner who has not enrolled themselves, allowed once they have", async () => {
    vi.resetModules();
    let enrolled = false;
    vi.doMock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
    vi.doMock("@/server/platform/admin-auth", async (orig) => ({ ...(await orig<object>()), requireAdminAction: async () => ({ id: "o1", email: "o@t.dev", role: "OWNER", totpEnabled: enrolled }), platformAudit: async () => {} }));
    const { setStaff2faAction } = await import("@/server/actions/platform");
    await platformDb().siteSetting.deleteMany({ where: { key: "platform" } });
    expect(await setStaff2faAction({ mode: "all" })).toMatchObject({ ok: false });
    expect((await getPlatformSettings()).staff2fa).toBe("off");
    expect(await setStaff2faAction({ mode: "off" })).toMatchObject({ ok: true });
    enrolled = true;
    expect(await setStaff2faAction({ mode: "all" })).toMatchObject({ ok: true });
    expect((await getPlatformSettings()).staff2fa).toBe("all");
    await platformDb().siteSetting.deleteMany({ where: { key: "platform" } });
    vi.doUnmock("@/server/platform/admin-auth");
  });
});
