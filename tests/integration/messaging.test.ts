import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { listMessagesAction, logMessageAction, sendMessageAction } from "@/server/actions/messages";
import { GET as waVerify, POST as waWebhook } from "@/app/api/webhooks/whatsapp/route";
import { POST as emailWebhook } from "@/app/api/webhooks/email/route";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { normalizePhone } from "@/lib/utils";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
let contactA: string;
let leadA: string;
let central: string; // a contact that is not with any dealership
const PHONE = "0300 1234567";
const WA_ENV = { WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_APP_SECRET: "appsecret", WHATSAPP_VERIFY_TOKEN: "verify-me" };

const as = async (id: string) => { session.current = await asUser(id); };
const sign = (body: string) => `sha256=${createHmac("sha256", WA_ENV.WHATSAPP_APP_SECRET).update(body).digest("hex")}`;
const inbound = (id: string, from = "923001234567", text = "Is the GT70 available?") => JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }] });
const status = (id: string, s: string) => JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status: s, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
const post = (raw: string, signature: string | null = sign(raw)) => waWebhook(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", body: raw, headers: signature ? { "x-hub-signature-256": signature } : {} }));

async function makeContact(name: string, dealershipId: string | null, userId: string | null, phone: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.contact.create({ data: { firstName: name, phone, phoneNormalized: normalizePhone(phone), email: `${name.toLowerCase()}@example.com`, emailNormalized: `${name.toLowerCase()}@example.com` } });
    const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "MANUAL" });
    if (dealershipId) await assignLead(tx, { leadId: l.id, dealershipId, userId, type: "MANUAL", assignedById: w.staff.id });
    return { contact: c.id, lead: l.id };
  });
}

const saved: Record<string, string | undefined> = {};
function connectWhatsApp() {
  for (const [k, v] of Object.entries(WA_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
}
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; delete saved[k]; }
  delete process.env.SMTP_HOST;
  delete process.env.EMAIL_INBOUND_SECRET;
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  w = await buildWorld();
  ({ contact: contactA, lead: leadA } = await makeContact("Alpha", w.A.id, w.aRep.id, PHONE));
  ({ contact: central } = await makeContact("Central", null, null, "0311 7654321"));
  session.current = null;
});

describe("chat when no channel is connected", () => {
  it("refuses to send, and logged conversations are labelled as manual — never as sent", async () => {
    await as(w.aRep.id);
    const sent = await sendMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", body: "Hello" });
    expect(sent.ok).toBe(false);
    expect(await db.message.count()).toBe(0);
    expect((await sendMessageAction({ contactId: contactA, channel: "EMAIL", body: "Hello", subject: "Hi" })).ok).toBe(false);

    expect(await logMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", direction: "OUTBOUND", body: "Called and WhatsApped about GT70" })).toMatchObject({ ok: true });
    const m = await db.message.findFirstOrThrow();
    expect(m).toMatchObject({ status: "LOGGED", direction: "OUTBOUND", dealershipId: w.A.id, sentById: w.aRep.id });
    expect(await db.activity.count({ where: { contactId: contactA, type: "WHATSAPP_LOGGED", outcome: "Logged" } })).toBe(1);
  });

  it("an emailed log needs a subject", async () => {
    await as(w.aRep.id);
    expect((await logMessageAction({ contactId: contactA, channel: "EMAIL", direction: "INBOUND", body: "Please call me" })).ok).toBe(false);
    expect((await logMessageAction({ contactId: contactA, channel: "EMAIL", direction: "INBOUND", body: "Please call me", subject: "Call" })).ok).toBe(true);
  });
});

describe("chat visibility", () => {
  it("a dealership only sees conversations tagged with its own dealership", async () => {
    await as(w.aRep.id);
    await logMessageAction({ contactId: contactA, channel: "WHATSAPP", direction: "INBOUND", body: "dealer-visible" });
    await as(w.staff.id);
    // head office talks to a contact that no dealership has — that stays central-only
    await logMessageAction({ contactId: central, channel: "WHATSAPP", direction: "OUTBOUND", body: "central-only" });
    const seen = async (id: string, contact: string) => {
      await as(id);
      const r = await listMessagesAction(contact);
      return r.ok ? (r.data ?? []).map((m) => m.body) : "denied";
    };
    expect(await seen(w.aManager.id, contactA)).toEqual(["dealer-visible"]);
    expect(await seen(w.staff.id, contactA)).toEqual(["dealer-visible"]);
    expect(await seen(w.bManager.id, contactA)).toBe("denied"); // another dealership can't even open the contact
    expect(await seen(w.aManager.id, central)).toBe("denied");
    expect(await seen(w.staff.id, central)).toEqual(["central-only"]);
  });

  it("users without messaging permission can't read or write chat", async () => {
    await as(w.mgmt.id); // management has no messages.send
    expect((await listMessagesAction(contactA)).ok).toBe(false);
    expect((await logMessageAction({ contactId: contactA, channel: "WHATSAPP", direction: "OUTBOUND", body: "x" })).ok).toBe(false);
  });
});

describe("WhatsApp integration", () => {
  it("the webhook is off until configured, answers Meta's handshake, and rejects unsigned posts", async () => {
    expect((await waVerify(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"))).status).toBe(404);
    connectWhatsApp();
    const ok = await waVerify(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    expect((await waVerify(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"))).status).toBe(403);
    const raw = inbound("wamid.1");
    expect((await post(raw, null)).status).toBe(401);
    expect((await post(raw, "sha256=" + "0".repeat(64))).status).toBe(401);
    expect(await db.message.count()).toBe(0);
  });

  it("stores an inbound message once, on the right contact, and tells the assigned rep", async () => {
    connectWhatsApp();
    const raw = inbound("wamid.1");
    expect(await (await post(raw)).json()).toMatchObject({ stored: 1 });
    expect(await (await post(raw)).json()).toMatchObject({ stored: 0 }); // Meta retries are idempotent
    const m = await db.message.findFirstOrThrow();
    expect(m).toMatchObject({ contactId: contactA, direction: "INBOUND", status: "RECEIVED", dealershipId: w.A.id, externalId: "wamid.1" });
    expect(await db.notification.count({ where: { userId: w.aRep.id, type: "MESSAGE_RECEIVED" } })).toBe(1);
    expect(await db.activity.count({ where: { contactId: contactA, type: "WHATSAPP_LOGGED", direction: "INBOUND" } })).toBe(1);
    // numbers that match no contact are ignored, not invented into new people
    expect(await (await post(inbound("wamid.2", "923999999999"))).json()).toMatchObject({ stored: 0, unmatched: 1 });
    expect(await db.contact.count()).toBe(2);
  });

  it("sends free text only inside the 24-hour window and only records SENT when WhatsApp accepts it", async () => {
    connectWhatsApp();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OUT1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await as(w.aRep.id);

    // no inbound message yet → blocked before any request leaves the system
    const early = await sendMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", body: "Hello Alpha" });
    expect(early.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await post(inbound("wamid.IN1"));
    const sent = await sendMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", body: "Yes, GT70 is in stock" });
    expect(sent.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain("/123/messages");
    expect(JSON.parse(init.body)).toMatchObject({ to: "923001234567", type: "text", text: { body: "Yes, GT70 is in stock" } });
    const out = await db.message.findFirstOrThrow({ where: { direction: "OUTBOUND" } });
    expect(out).toMatchObject({ status: "SENT", externalId: "wamid.OUT1", sentById: w.aRep.id });

    // sending the same text again straight away is treated as a double click
    expect((await sendMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", body: "Yes, GT70 is in stock" })).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // delivery receipts move forward only
    await post(status("wamid.OUT1", "read"));
    await post(status("wamid.OUT1", "delivered"));
    expect((await db.message.findFirstOrThrow({ where: { externalId: "wamid.OUT1" } })).status).toBe("READ");
  });

  it("a rejected send is recorded as FAILED with the provider's reason, never as sent", async () => {
    connectWhatsApp();
    await post(inbound("wamid.IN1"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Recipient not in allowed list", code: 131030 } }), { status: 400 })));
    await as(w.aRep.id);
    const r = await sendMessageAction({ contactId: contactA, leadId: leadA, channel: "WHATSAPP", body: "Hello" });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain("Recipient not in allowed list");
    const m = await db.message.findFirstOrThrow({ where: { direction: "OUTBOUND" } });
    expect(m.status).toBe("FAILED");
    expect(m.error).toContain("Recipient not in allowed list");
    expect(await db.activity.count({ where: { contactId: contactA, direction: "OUTBOUND", type: "WHATSAPP_LOGGED" } })).toBe(0);
  });

  it("respects a contact's WhatsApp opt-out", async () => {
    connectWhatsApp();
    await post(inbound("wamid.IN1"));
    await db.contact.update({ where: { id: contactA }, data: { communicationPrefs: { whatsapp: false } } });
    vi.stubGlobal("fetch", vi.fn());
    await as(w.aRep.id);
    expect((await sendMessageAction({ contactId: contactA, channel: "WHATSAPP", body: "Hi" })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("inbound email", () => {
  const call = (body: unknown, secret: string | null = "email-secret") =>
    emailWebhook(new NextRequest("http://localhost/api/webhooks/email", { method: "POST", body: JSON.stringify(body), headers: secret ? { "x-webhook-secret": secret } : {} }));

  it("needs the shared secret, then matches the sender to a contact and is idempotent", async () => {
    expect((await call({ from: "alpha@example.com", text: "hi", messageId: "<1@x>" })).status).toBe(404); // not configured yet
    process.env.EMAIL_INBOUND_SECRET = "email-secret";
    expect((await call({ from: "alpha@example.com", text: "hi", messageId: "<1@x>" }, null)).status).toBe(403);
    expect((await call({ from: "alpha@example.com", text: "hi", messageId: "<1@x>" }, "wrong")).status).toBe(403);
    const body = { from: "Alpha Customer <Alpha@Example.com>", subject: "Price?", text: "What is the price of the GT70?", messageId: "<abc@mail>" };
    expect(await (await call(body)).json()).toMatchObject({ stored: 1 });
    expect(await (await call(body)).json()).toMatchObject({ stored: 0 });
    expect(await db.message.findFirstOrThrow()).toMatchObject({ contactId: contactA, channel: "EMAIL", direction: "INBOUND", subject: "Price?", dealershipId: w.A.id });
    expect(await (await call({ from: "stranger@example.com", text: "hello", messageId: "<z@mail>" })).json()).toMatchObject({ stored: 0, unmatched: 1 });
    expect((await call({ from: "alpha@example.com", messageId: "<q>" })).status).toBe(400);
  });
});
