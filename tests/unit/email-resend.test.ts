import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverEmail, emailConfigured, sendEmail } from "@/server/messaging/providers";

const KEYS = ["RESEND_API_KEY", "SMTP_HOST", "MAIL_FROM", "EMAIL_FROM", "EMAIL_REPLY_TO"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

describe("CRM email through Resend", () => {
  it("counts as configured with only RESEND_API_KEY", () => {
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    expect(emailConfigured()).toBe(true);
  });

  it("posts to Resend with MAIL_FROM and returns the message id", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Velocity ERP <no-reply@example.com>";
    process.env.EMAIL_REPLY_TO = "help@example.com";
    delete process.env.SMTP_HOST;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ to: "dealer@example.com", subject: "Hi", body: "Hello" })).resolves.toEqual({ externalId: "abc123" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Velocity ERP <no-reply@example.com>", to: ["dealer@example.com"], subject: "Hi", text: "Hello", reply_to: "help@example.com" });
  });

  it("reports a Resend rejection as a retryable provider error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    await expect(deliverEmail({ to: "a@b.co", subject: "s", body: "b" })).rejects.toMatchObject({ retryable: true, message: expect.stringContaining("domain not verified") });
  });

  it("refuses when neither Resend nor SMTP is configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    await expect(sendEmail({ to: "a@b.co", subject: "s", body: "b" })).rejects.toThrow("not connected");
  });
});
