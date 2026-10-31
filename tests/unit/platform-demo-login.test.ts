import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { platformDemoLogin } = await import("@/server/platform/demo-login");

const base = { PLATFORM_DEMO_EMAIL: "Demo@Example.com", PLATFORM_DEMO_PASSWORD: "throwaway-pass-1" };

describe("platformDemoLogin", () => {
  it("is off unless explicitly enabled", () => {
    expect(platformDemoLogin(base)).toBeNull();
    expect(platformDemoLogin({ ...base, SHOW_PLATFORM_DEMO_CREDENTIALS: "1" })).toBeNull();
  });
  it("returns the configured demo account when enabled", () => {
    expect(platformDemoLogin({ ...base, SHOW_PLATFORM_DEMO_CREDENTIALS: "true" })).toEqual({ email: "demo@example.com", password: "throwaway-pass-1" });
  });
  it("needs both an email and a password", () => {
    expect(platformDemoLogin({ SHOW_PLATFORM_DEMO_CREDENTIALS: "true", PLATFORM_DEMO_EMAIL: "a@b.co" })).toBeNull();
  });
  it("never shows the owner account or the owner bootstrap password", () => {
    const on = { ...base, SHOW_PLATFORM_DEMO_CREDENTIALS: "true" };
    expect(platformDemoLogin({ ...on, PLATFORM_ADMIN_EMAIL: "demo@example.com" })).toBeNull();
    expect(platformDemoLogin({ ...on, PLATFORM_ADMIN_PASSWORD: "throwaway-pass-1" })).toBeNull();
  });
});
