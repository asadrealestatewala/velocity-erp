import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { platformDb } from "@/server/platform/client";
import { sendSystemMail } from "@/server/platform/mail";
import { clearMailConfigCache, loadMailConfig, saveMailBrand, saveMailRouting } from "@/server/platform/mail-config";
import { getThread, handleResendEvent, listInbox, replyToMessage, setInboxStatus } from "@/server/platform/mail-inbox";
import { renderTemplate, sendTemplate } from "@/server/platform/mail-send";
import { DEFAULT_BRAND } from "@/server/platform/mail-layout";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";
import { POST as webhook } from "@/app/api/platform/mail/webhook/resend/route";

const db = () => platformDb();
const secretBytes = Buffer.from("integration-test-signing-secret!");
const SECRET = `whsec_${secretBytes.toString("base64")}`;
const saved = { key: process.env.RESEND_API_KEY, wh: process.env.RESEND_WEBHOOK_SECRET };

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let sentCounter = 0;
const fetchStub = vi.fn(async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  if (url.endsWith("/emails")) return new Response(JSON.stringify({ id: `sent-${++sentCounter}` }), { status: 200 });
  if (url.includes("/emails/receiving/")) return new Response(JSON.stringify({ text: "Please help with my invoice", message_id: "<orig-1@mail.example>" }), { status: 200 });
  return new Response("{}", { status: 404 });
});

async function cleanup() {
  await db().mailMessage.deleteMany({});
  await db().mailTemplate.deleteMany({});
  await db().mailMailbox.deleteMany({});
  await db().siteSetting.deleteMany({ where: { key: "mail" } });
  clearMailConfigCache();
}

beforeAll(() => {
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  process.env.MAIL_FROM = "Velocity <no-reply@velocityerp.co>";
  vi.stubGlobal("fetch", fetchStub);
});
beforeEach(async () => { calls.length = 0; await cleanup(); });
afterAll(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  for (const [k, v] of [["RESEND_API_KEY", saved.key], ["RESEND_WEBHOOK_SECRET", saved.wh]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

const body = (c: Call) => JSON.parse(c.init.body as string) as Record<string, unknown>;

describe("sender identities", () => {
  it("creates no-reply, billing and support and routes each category to its mailbox", async () => {
    const cfg = await loadMailConfig();
    expect(cfg.mailboxes.map((m) => m.address).sort()).toEqual(["billing@velocityerp.co", "no-reply@velocityerp.co", "support@velocityerp.co"]);
    await sendSystemMail({ to: "a@b.co", subject: "Receipt", text: "t", category: "billing" });
    await sendSystemMail({ to: "a@b.co", subject: "Welcome", text: "t", category: "onboarding" });
    expect(String(body(calls[0]!).from)).toContain("<billing@velocityerp.co>");
    expect(String(body(calls[1]!).from)).toContain("<no-reply@velocityerp.co>");
    const log = await db().mailMessage.findMany({ orderBy: { createdAt: "asc" } });
    expect(log.map((m) => [m.mailboxKey, m.delivery, m.providerId])).toEqual([["billing", "SENT", "sent-1"], ["no-reply", "SENT", "sent-2"]]);
  });

  it("follows the routing the operator saves", async () => {
    await loadMailConfig();
    await saveMailRouting({ onboarding: "support", auth: "no-reply", billing: "billing", support: "support", system: "no-reply" });
    await sendSystemMail({ to: "a@b.co", subject: "Welcome", text: "t", category: "onboarding" });
    expect(String(body(calls[0]!).from)).toContain("<support@velocityerp.co>");
  });

  it("logs unsent mail as NOT_SENT instead of pretending, and failures as FAILED without leaking the key", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendSystemMail({ to: "a@b.co", subject: "Hi", text: "t" });
    expect(r.delivered).toBe(false);
    process.env.RESEND_API_KEY = "re_test_not_a_real_key";
    fetchStub.mockImplementationOnce(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    const r2 = await sendSystemMail({ to: "c@d.co", subject: "Hi 2", text: "t" });
    expect(r2.delivered).toBe(false);
    const log = await db().mailMessage.findMany({ orderBy: { createdAt: "asc" } });
    expect(log.map((m) => m.delivery)).toEqual(["NOT_SENT", "FAILED"]);
    expect(log[1]!.deliveryDetail).toContain("403");
    expect(JSON.stringify(log)).not.toContain("re_test_not_a_real_key");
  });

  it("does not keep the body of messages with one-time links", async () => {
    await sendSystemMail({ to: "a@b.co", subject: "Reset", text: "https://x/reset/SECRET-TOKEN", html: "<a href='https://x/reset/SECRET-TOKEN'>x</a>", category: "auth" });
    const [m] = await db().mailMessage.findMany();
    expect(m!.bodyText).not.toContain("SECRET-TOKEN");
    expect(m!.bodyHtml).toBeNull();
  });
});

describe("branded templates", () => {
  it("applies company branding and the operator's wording to what is sent", async () => {
    await saveMailBrand({ ...DEFAULT_BRAND, companyName: "Acme Motors", addressLine: "1 Test Road", supportEmail: "help@acme.test", logoUrl: "" });
    await db().mailTemplate.create({ data: { key: "welcome", subject: "Hello {{name}} from {{platformName}}", heading: "Hi {{name}}", body: "Custom line for {{workspaceName}}.", ctaLabel: "Sign in", ctaUrl: "{{loginUrl}}" } });
    const r = await sendTemplate("welcome", "mia@x.co", { name: "Mia", workspaceName: "Mia Motors", workspaceCode: "mia", loginUrl: "https://app.test/login" });
    expect(r.delivered).toBe(true);
    const sent = body(calls[0]!);
    expect(sent.subject).toBe("Hello Mia from Acme Motors");
    expect(String(sent.html)).toContain("Custom line for Mia Motors.");
    expect(String(sent.html)).toContain("1 Test Road");
    expect(String(sent.html)).toContain("help@acme.test");
    expect(String(sent.text)).toContain("Acme Motors");
    const [m] = await db().mailMessage.findMany();
    expect(m).toMatchObject({ templateKey: "welcome", category: "onboarding", toAddress: "mia@x.co" });
  });

  it("sends nothing for a switched-off optional template, but never for a required one", async () => {
    await db().mailTemplate.create({ data: { key: "welcome", subject: "s", heading: "h", body: "b", isEnabled: false } });
    await db().mailTemplate.create({ data: { key: "password-reset", subject: "s", heading: "h", body: "b", isEnabled: false } });
    expect((await sendTemplate("welcome", "a@b.co", { name: "A" })).delivered).toBe(false);
    expect(calls).toHaveLength(0);
    expect((await sendTemplate("password-reset", "a@b.co", { email: "a@b.co" })).delivered).toBe(true);
  });

  it("previews unsaved drafts with sample data", async () => {
    const m = await renderTemplate("invite", { inviterName: "Sam", workspaceName: "W", workspaceCode: "w", roleName: "Sales", inviteUrl: "https://i.test/x", expiryDays: 7 }, { heading: "Draft for {{inviterName}}" });
    expect(m.html).toContain("Draft for Sam");
    expect(m.subject).toBe("You're invited to W");
  });
});

describe("inbox", () => {
  async function receive(emailId: string, to = "support@velocityerp.co", subject = "Invoice question") {
    await loadMailConfig();
    return handleResendEvent({ type: "email.received", data: { email_id: emailId, from: "Mia Khan <mia@x.co>", to: [to], subject } });
  }

  it("stores received mail once, in the mailbox it was sent to, linked to the customer", async () => {
    expect(await receive("in-1", "billing@velocityerp.co")).toBe("stored");
    expect(await receive("in-1", "billing@velocityerp.co")).toBe("duplicate");
    const rows = await db().mailMessage.findMany({ where: { direction: "INBOUND" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mailboxKey: "billing", fromAddress: "mia@x.co", fromName: "Mia Khan", bodyText: "Please help with my invoice", inboxStatus: "NEW", messageIdHeader: "<orig-1@mail.example>" });
  });

  it("links a message to the workspace whose owner wrote it", async () => {
    const slug = "t-mailconsole-co";
    const email = "owner@t-mailconsole-co.test";
    const wipe = async () => { await dropSchema(schemaNameFor(slug)).catch(() => {}); await db().tenant.deleteMany({ where: { slug } }); await db().trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(email) } }); invalidateTenant(); };
    await wipe();
    try {
      await ensureDefaultPlans();
      const { tenantId } = await createWorkspace({ slug, companyName: "Mail Console Co", ownerName: "Owen Ner", ownerEmail: email, ownerPassword: "Correct-Horse-Battery-1", source: "SIGNUP" });
      await loadMailConfig();
      await handleResendEvent({ type: "email.received", data: { email_id: "in-t", from: `Owen <${email.toUpperCase()}>`, to: ["support@velocityerp.co"], subject: "Hi" } });
      expect((await db().mailMessage.findFirst({ where: { direction: "INBOUND" } }))!.tenantId).toBe(tenantId);
    } finally {
      await wipe();
    }
  }, 180_000);

  it("shows each role only its own mailbox", async () => {
    await receive("in-s", "support@velocityerp.co");
    await receive("in-b", "billing@velocityerp.co", "Payment");
    expect((await listInbox("OWNER")).map((m) => m.mailboxKey).sort()).toEqual(["billing", "support"]);
    expect((await listInbox("SUPPORT")).map((m) => m.mailboxKey)).toEqual(["support"]);
    expect((await listInbox("BILLING")).map((m) => m.mailboxKey)).toEqual(["billing"]);
    expect(await listInbox("ANALYTICS")).toHaveLength(0);
    const billing = (await db().mailMessage.findFirst({ where: { mailboxKey: "billing" } }))!;
    expect(await getThread(billing.id, "SUPPORT")).toBeNull();
    expect(await getThread(billing.id, "BILLING")).not.toBeNull();
    await expect(setInboxStatus(billing.id, "RESOLVED", "SUPPORT")).rejects.toThrow(/not found/i);
  });

  it("replies from the same mailbox, threaded, and tracks the conversation status", async () => {
    await receive("in-r", "support@velocityerp.co");
    const orig = (await db().mailMessage.findFirst({ where: { direction: "INBOUND" } }))!;
    const r = await replyToMessage(orig.id, "Thanks, fixed it.", { email: "agent@velocityerp.co", name: "Agent" }, "SUPPORT");
    expect(r.delivered).toBe(true);
    const sendCall = calls.find((c) => c.url.endsWith("/emails"))!;
    const sent = body(sendCall);
    expect(String(sent.from)).toContain("<support@velocityerp.co>");
    expect(sent.to).toEqual(["mia@x.co"]);
    expect(sent.subject).toBe("Re: Invoice question");
    expect(sent.headers).toMatchObject({ "In-Reply-To": "<orig-1@mail.example>" });
    expect(String(sent.text)).toContain("Thanks, fixed it.");
    const { thread } = (await getThread(orig.id, "SUPPORT"))!;
    expect(thread.map((m) => m.direction)).toEqual(["INBOUND", "OUTBOUND"]);
    expect((await db().mailMessage.findUnique({ where: { id: orig.id } }))!.inboxStatus).toBe("OPEN");
    await setInboxStatus(orig.id, "RESOLVED", "SUPPORT");
    expect((await db().mailMessage.findUnique({ where: { id: orig.id } }))!.inboxStatus).toBe("RESOLVED");
    await expect(replyToMessage(orig.id, " ", { email: "a@b.co", name: "A" }, "SUPPORT")).rejects.toThrow();
  });
});

describe("delivery status", () => {
  it("updates the sent log from provider events and never moves backwards", async () => {
    await sendSystemMail({ to: "a@b.co", subject: "Hi", text: "t" });
    const id = (await db().mailMessage.findFirst())!.providerId!;
    expect(await handleResendEvent({ type: "email.delivered", data: { email_id: id } })).toBe("updated");
    expect(await handleResendEvent({ type: "email.sent", data: { email_id: id } })).toBe("ignored"); // late, out-of-order
    expect((await db().mailMessage.findFirst())!.delivery).toBe("DELIVERED");
    expect(await handleResendEvent({ type: "email.bounced", data: { email_id: id, bounce: { message: "Mailbox full" } } })).toBe("updated");
    expect(await db().mailMessage.findFirst()).toMatchObject({ delivery: "BOUNCED", deliveryDetail: "Mailbox full" });
    expect(await handleResendEvent({ type: "email.delivered", data: { email_id: "unknown" } })).toBe("ignored");
  });
});

describe("webhook endpoint", () => {
  const post = (payload: object, opts: { secret?: Buffer; id?: string; ts?: string; tamper?: boolean } = {}) => {
    const raw = JSON.stringify(payload);
    const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
    const id = opts.id ?? "msg_1";
    const sig = createHmac("sha256", opts.secret ?? secretBytes).update(`${id}.${ts}.${raw}`).digest("base64");
    return webhook(new NextRequest("http://localhost/api/platform/mail/webhook/resend", { method: "POST", body: opts.tamper ? raw + " " : raw, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  };
  const evt = { type: "email.received", data: { email_id: "wh-1", from: "z@x.co", to: ["support@velocityerp.co"], subject: "Hello" } };

  it("accepts a signed event and stores the mail", async () => {
    const res = await post(evt);
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("stored");
    expect(await db().mailMessage.count({ where: { direction: "INBOUND" } })).toBe(1);
  });
  it("rejects forged, tampered and replayed-too-late requests without storing anything", async () => {
    expect((await post(evt, { secret: Buffer.from("not-the-secret") })).status).toBe(400);
    expect((await post(evt, { tamper: true })).status).toBe(400);
    expect((await post(evt, { ts: String(Math.floor(Date.now() / 1000) - 7200) })).status).toBe(400);
    expect(await db().mailMessage.count()).toBe(0);
  });
  it("refuses everything while no signing secret is configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      expect((await post(evt)).status).toBe(503);
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = SECRET;
    }
  });
  it("asks Resend to retry when the body cannot be fetched", async () => {
    fetchStub.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    expect((await post({ ...evt, data: { ...evt.data, email_id: "wh-2" } })).status).toBe(500);
    expect(await db().mailMessage.count()).toBe(0);
  });
});
