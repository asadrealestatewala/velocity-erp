import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { db } from "@/lib/db";
import { aiConfigured, aiModelLabel, aiProvider, describeLlmError, runAssistant } from "@/server/assistant/engine";
import { LlmProviderError } from "@/server/assistant/openai-compat";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { normalizePhone } from "@/lib/utils";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (message: Record<string, unknown>, finish = "stop") => json({ choices: [{ finish_reason: finish, message }] });

beforeEach(async () => {
  w = await buildWorld();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
  vi.stubEnv("ASSISTANT_PROVIDER", "openai-compatible");
  vi.stubEnv("ASSISTANT_BASE_URL", "https://llm.example.test/v1/");
  vi.stubEnv("ASSISTANT_MODEL", "test-model");
  vi.stubEnv("ASSISTANT_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("assistant on an OpenAI-compatible service", () => {
  it("is recognised from configuration, and needs the address and model", () => {
    expect(aiProvider()).toBe("openai-compatible");
    expect(aiConfigured()).toBe(true);
    expect(aiModelLabel()).toBe("test-model via llm.example.test");
    vi.stubEnv("ASSISTANT_MODEL", "");
    expect(aiConfigured()).toBe(false); // provider chosen but no model → still the built-in guide
    vi.stubEnv("ASSISTANT_MODEL", "m");
    vi.stubEnv("ASSISTANT_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(aiProvider()).toBe("anthropic");
  });

  it("runs a full tool round trip through the service, with the user's permissions", async () => {
    const mk = async (dealershipId: string, userId: string, name: string, email: string) => db.$transaction(async (tx) => {
      const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;
      const c = await tx.contact.create({ data: { firstName: name, phone, phoneNormalized: normalizePhone(phone), email, emailNormalized: email, type: "CUSTOMER" } });
      const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "MANUAL" });
      await assignLead(tx, { leadId: l.id, dealershipId, userId, type: "MANUAL", assignedById: w.staff.id });
    });
    await mk(w.A.id, w.aRep.id, "Mine", "mine@example.com");
    await mk(w.B.id, w.bRep.id, "Theirs", "theirs@example.com");

    const requests: { url: string; headers: Record<string, string>; body: { model: string; messages: { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }[]; tools: { function: { name: string; parameters: unknown } }[] } }[] = [];
    const script = [
      completion({ content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "query_data", arguments: JSON.stringify({ entity: "contacts", filters: [{ field: "type", op: "eq", value: "customer" }, { field: "email", op: "not_null" }] }) } }] }, "tool_calls"),
      completion({ content: "You have 1 customer with an email." }),
    ];
    vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string>; body: string }) => {
      requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return script.shift()!;
    });

    const user = await asUser(w.aManager.id);
    const reply = await runAssistant(user, [], "how many customers have an email?");
    expect(reply).toMatchObject({ mode: "ai", text: "You have 1 customer with an email." });

    // first request: right address, key, model, the app's knowledge as the system message, tools without unsupported schema hints
    const r1 = requests[0]!;
    expect(r1.url).toBe("https://llm.example.test/v1/chat/completions");
    expect(r1.headers.authorization).toBe("Bearer test-key");
    expect(r1.body.model).toBe("test-model");
    expect(r1.body.messages[0]).toMatchObject({ role: "system" });
    expect(r1.body.messages[0]!.content).toMatch(/Screen map/);
    expect(r1.body.messages.at(-1)).toEqual({ role: "user", content: "how many customers have an email?" });
    const queryTool = r1.body.tools.find((t) => t.function.name === "query_data")!;
    expect(JSON.stringify(queryTool.function.parameters)).not.toMatch(/additionalProperties/);
    // second request: the tool call and its result are sent back, and the result is limited to the user's dealership
    const r2 = requests[1]!;
    const assistantTurn = r2.body.messages.find((m) => m.role === "assistant")!;
    expect(assistantTurn.tool_calls).toHaveLength(1);
    const toolTurn = r2.body.messages.find((m) => m.role === "tool")!;
    expect(toolTurn.tool_call_id).toBe("call_1");
    expect(JSON.parse(toolTurn.content!)).toMatchObject({ entity: "contacts", matching: 1 });
  });

  it("turns provider failures into readable messages", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    const user = await asUser(w.aManager.id);
    const err = await runAssistant(user, [], "hi").catch((e) => e);
    expect(err).toBeInstanceOf(LlmProviderError);
    expect(describeLlmError(err)).toMatch(/key.*rejected/i);
    vi.stubGlobal("fetch", async () => new Response("slow down", { status: 429 }));
    expect(describeLlmError(await runAssistant(user, [], "hi").catch((e) => e))).toMatch(/busy|quota/i);
    vi.stubGlobal("fetch", async () => new Response("bad", { status: 400 }));
    expect(describeLlmError(await runAssistant(user, [], "hi").catch((e) => e))).toMatch(/tool calling/i);
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    expect(describeLlmError(await runAssistant(user, [], "hi").catch((e) => e))).toMatch(/reach/i);
  });
});
