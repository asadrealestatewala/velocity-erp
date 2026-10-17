import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "@/lib/utils";
import { detectFile } from "@/server/storage";

describe("normalisation for duplicate matching", () => {
  it("normalises local, international and formatted phone numbers to the same value", () => {
    const variants = ["0300 1234567", "+92 300 1234567", "0092-300-1234567", "(0300) 123-4567", "923001234567"];
    expect(new Set(variants.map((v) => normalizePhone(v))).size).toBe(1);
    expect(normalizePhone("0300 1234567")).toBe("923001234567");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("normalises emails", () => {
    expect(normalizeEmail("  Ali.Khan@Example.COM ")).toBe("ali.khan@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
});

describe("contact form schema", () => {
  it("accepts untouched (undefined) custom fields and blank optional inputs from the form", async () => {
    const { contactSchema } = await import("@/lib/validation");
    const r = contactSchema.safeParse({ firstName: "A", phone: "0300 1234567", website: "", dateOfBirth: "", customFields: { preferred_color: undefined, financing_interest: undefined }, communicationPrefs: { sms: undefined } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customFields).toEqual({});
  });
  it("requires a phone or an email", async () => {
    const { contactSchema } = await import("@/lib/validation");
    expect(contactSchema.safeParse({ firstName: "A" }).success).toBe(false);
  });
});

describe("demo credentials panel", () => {
  it("is never exposed in production, and can be disabled locally", async () => {
    const { getDemoAccounts } = await import("@/server/demo");
    const env = process.env as Record<string, string | undefined>;
    const before = { node: env.NODE_ENV, flag: env.SHOW_DEMO_CREDENTIALS };
    try {
      env.NODE_ENV = "production";
      env.SHOW_DEMO_CREDENTIALS = "true";
      expect(await getDemoAccounts()).toBeNull();
      env.NODE_ENV = "development";
      env.SHOW_DEMO_CREDENTIALS = "false";
      expect(await getDemoAccounts()).toBeNull();
    } finally {
      env.NODE_ENV = before.node;
      env.SHOW_DEMO_CREDENTIALS = before.flag;
    }
  });
});

describe("upload validation", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const pdf = Buffer.from("%PDF-1.7 ...");
  it("accepts files whose content matches the extension", () => {
    expect(detectFile("photo.png", png, "image")).toBe("image/png");
    expect(detectFile("profile.pdf", pdf, "document")).toBe("application/pdf");
  });
  it("rejects disallowed types, spoofed content and documents in image-only fields", () => {
    expect(() => detectFile("run.exe", Buffer.from("MZ"), "document")).toThrow(/not allowed/);
    expect(() => detectFile("fake.pdf", Buffer.from("<script>"), "document")).toThrow(/does not match/);
    expect(() => detectFile("doc.pdf", pdf, "image")).toThrow(/images/);
    expect(() => detectFile("x.svg", Buffer.from("<svg/>"), "image")).toThrow(/not allowed/);
  });
});
