import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND, layoutMail } from "@/server/platform/mail-layout";
import { TEMPLATES, interpolate, sampleVars, unknownVariables, templateDef } from "@/server/platform/mail-templates";
import { deliveryAdvances, htmlToText, parseAddress, threadKeyFor, verifyResendSignature } from "@/server/platform/mail-webhook";

const BASE = "https://app.example.com";

describe("branded email layout", () => {
  const brand = { ...DEFAULT_BRAND, companyName: "Velocity <ERP>", addressLine: "12 Main Blvd, Lahore", website: "https://velocityerp.co", supportEmail: "support@velocityerp.co", supportPhone: "+92 300 0000000", footerNote: "Reg. 12345", accentColor: "#112233", logoUrl: "/brand/logo.png" };
  const out = layoutMail(brand, BASE, { heading: "Hi <b>there</b>", paragraphs: ["Line one", "A & B"], cta: { label: "Go", url: "https://x.test/a?b=1&c=2" } });

  it("puts the company name, address, support contact and logo in every message", () => {
    expect(out.html).toContain("12 Main Blvd, Lahore");
    expect(out.html).toContain("mailto:support@velocityerp.co");
    expect(out.html).toContain("+92 300 0000000");
    expect(out.html).toContain(`src="${BASE}/brand/logo.png"`);
    expect(out.html).toContain("background:#112233");
    expect(out.text).toContain("12 Main Blvd, Lahore");
    expect(out.text).toContain("Need help? support@velocityerp.co");
  });
  it("escapes everything it is given", () => {
    expect(out.html).toContain("Velocity &lt;ERP&gt;");
    expect(out.html).toContain("Hi &lt;b&gt;there&lt;/b&gt;");
    expect(out.html).not.toContain("<b>there</b>");
  });
  it("never emits a javascript: logo/link or an invalid colour", () => {
    const evil = layoutMail({ ...brand, logoUrl: "javascript:alert(1)", website: "javascript:alert(1)", accentColor: "red;}</style>" }, BASE, { heading: "h", paragraphs: [], cta: { label: "x", url: "javascript:alert(1)" } });
    expect(evil.html).not.toContain("javascript:");
    expect(evil.html).not.toContain("</style>");
    expect(evil.html).toContain("Velocity &lt;ERP&gt;"); // falls back to the name when the logo is rejected
  });
});

describe("templates", () => {
  it("ships the SaaS onboarding set", () => {
    expect(TEMPLATES.map((t) => t.key).sort()).toEqual(["confirm-email", "invite", "password-reset", "payment-failed", "payment-receipt", "trial-ending", "trial-started", "welcome"]);
  });
  it("only uses variables it defines, and every sample fills them all", () => {
    for (const t of TEMPLATES) {
      expect(unknownVariables(t, t.subject, t.heading, t.body, t.ctaLabel, t.ctaUrl, t.footer ?? "")).toEqual([]);
      const filled = interpolate(`${t.subject} ${t.heading} ${t.body} ${t.ctaUrl}`, { ...sampleVars(t), platformName: "P", supportEmail: "s@x.co" });
      expect(filled).not.toMatch(/\{\{/);
    }
  });
  it("flags unknown variables and blanks missing values", () => {
    const def = templateDef("welcome")!;
    expect(unknownVariables(def, "Hi {{name}} {{passwordHash}}")).toEqual(["passwordHash"]);
    expect(interpolate("a {{name}} b {{ missing }}", { name: "X" })).toBe("a X b ");
  });
});

describe("Resend webhook signature", () => {
  const secretBytes = Buffer.from("super-secret-signing-key-bytes!!");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
  const sign = (id: string, ts: string, b = body) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${b}`).digest("base64")}`;
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));

  it("accepts a correct signature (also among several)", () => {
    expect(verifyResendSignature(body, { id: "m1", timestamp: ts, signature: sign("m1", ts) }, secret, now)).toBe(true);
    expect(verifyResendSignature(body, { id: "m1", timestamp: ts, signature: `v1,AAAA ${sign("m1", ts)}` }, secret, now)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets, stale timestamps and missing headers", () => {
    expect(verifyResendSignature(body + " ", { id: "m1", timestamp: ts, signature: sign("m1", ts) }, secret, now)).toBe(false);
    expect(verifyResendSignature(body, { id: "m1", timestamp: ts, signature: sign("m1", ts) }, `whsec_${Buffer.from("other-key").toString("base64")}`, now)).toBe(false);
    const old = String(Math.floor(now / 1000) - 3600);
    expect(verifyResendSignature(body, { id: "m1", timestamp: old, signature: sign("m1", old) }, secret, now)).toBe(false);
    expect(verifyResendSignature(body, { id: null, timestamp: ts, signature: sign("m1", ts) }, secret, now)).toBe(false);
    expect(verifyResendSignature(body, { id: "m1", timestamp: ts, signature: "v1," }, secret, now)).toBe(false);
    expect(verifyResendSignature(body, { id: "m1", timestamp: ts, signature: sign("m1", ts) }, "", now)).toBe(false);
  });
});

describe("mail helpers", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Mia Khan" <MIA@Example.com>')).toEqual({ name: "Mia Khan", address: "mia@example.com" });
    expect(parseAddress("bob@x.co")).toEqual({ name: null, address: "bob@x.co" });
  });
  it("threads replies with the original regardless of Re:/Fwd: prefixes", () => {
    expect(threadKeyFor("support", "A@x.co", "Re: RE: Help me")).toBe(threadKeyFor("support", "a@x.co", "help   me"));
    expect(threadKeyFor("support", "a@x.co", "Help")).not.toBe(threadKeyFor("billing", "a@x.co", "Help"));
  });
  it("only moves delivery status forward", () => {
    expect(deliveryAdvances("SENT", "DELIVERED")).toBe(true);
    expect(deliveryAdvances("BOUNCED", "SENT")).toBe(false);
    expect(deliveryAdvances("DELIVERED", "SENT")).toBe(false);
    expect(deliveryAdvances(null, "SENT")).toBe(true);
  });
  it("makes readable text from HTML mail", () => {
    expect(htmlToText("<style>x{}</style><p>Hello &amp; welcome</p><script>evil()</script><div>Bye</div>")).toBe("Hello & welcome\nBye");
  });
});
