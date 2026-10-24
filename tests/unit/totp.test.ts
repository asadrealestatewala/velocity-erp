import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { ROLE_PERMS, adminCan } from "@/server/platform/admin-auth";

// RFC 6238 appendix B: ASCII secret "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors (6-digit tails)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(hotp(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(RFC_SECRET, Math.floor(20000000000 / 30))).toBe("353130");
  });

  it("round-trips base32", () => {
    const s = newTotpSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(() => base32Decode("not*base32")).toThrow();
  });

  it("returns the matched step and tolerates one step of clock drift only", () => {
    const now = 1111111109 * 1000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, "081804", now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, "081 804", now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, "081804", now + 30_000)).toBe(step); // phone one step behind
    expect(verifyTotp(RFC_SECRET, "081804", now + 90_000)).toBeNull(); // too old
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });

  it("builds an otpauth URL and distinct recovery codes", () => {
    expect(otpauthUrl("ABC", "a@b.test", "My App")).toContain("secret=ABC&issuer=My%20App");
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });
});

describe("platform roles", () => {
  it("OWNER can do everything any other role can", () => {
    for (const role of ["BILLING", "SUPPORT", "ANALYTICS"] as const) for (const p of ROLE_PERMS[role]) expect(adminCan("OWNER", p)).toBe(true);
  });

  it("keeps the narrow roles narrow", () => {
    expect(adminCan("ANALYTICS", "payments.manage")).toBe(false);
    expect(adminCan("ANALYTICS", "tenants.manage")).toBe(false);
    expect(adminCan("SUPPORT", "payments.manage")).toBe(false);
    expect(adminCan("SUPPORT", "refunds.manage")).toBe(false);
    expect(adminCan("SUPPORT", "reports")).toBe(false);
    expect(adminCan("BILLING", "tenants.manage")).toBe(false);
    expect(adminCan("BILLING", "admins.manage")).toBe(false);
    expect(adminCan("BILLING", "settings.manage")).toBe(false);
    for (const role of ["BILLING", "SUPPORT", "ANALYTICS"] as const) {
      expect(adminCan(role, "admins.manage")).toBe(false);
      expect(adminCan(role, "system.manage")).toBe(false);
      expect(adminCan(role, "plans.manage")).toBe(false);
    }
  });
});
