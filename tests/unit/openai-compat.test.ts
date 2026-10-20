import { describe, expect, it } from "vitest";
import { fromChatResponse, simplifySchema, toChatMessages } from "@/server/assistant/openai-compat";
import type { LlmRequest } from "@/server/assistant/engine";

describe("OpenAI-compatible adapter: translation", () => {
  it("drops schema hints that some providers reject, keeping the structure", () => {
    const out = simplifySchema({
      type: "object", additionalProperties: false, required: ["entity"],
      properties: { entity: { type: "string" }, value: { type: ["string", "number", "array"], items: { type: ["string", "number"] }, description: "any" }, items: { type: "array", items: { type: "object", additionalProperties: false, properties: { op: { type: "string", enum: ["eq"] } } } } },
    });
    expect(out).toEqual({
      type: "object", required: ["entity"],
      properties: { entity: { type: "string" }, value: { items: {}, description: "any" }, items: { type: "array", items: { type: "object", properties: { op: { type: "string", enum: ["eq"] } } } } },
    });
  });

  it("turns the assistant's conversation (system, user, tool calls, tool results) into chat messages", () => {
    const req = {
      system: [{ type: "text", text: "Stable rules.", cache_control: { type: "ephemeral" } }, { type: "text", text: "Today is X." }],
      tools: [],
      messages: [
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "earlier answer" },
        { role: "user", content: "how many customers?" },
        { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "t1", name: "query_data", input: { entity: "contacts" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"matching\":3}" }, { type: "tool_result", tool_use_id: "t2", content: "boom", is_error: true }] },
      ],
    } as unknown as LlmRequest;
    expect(toChatMessages(req)).toEqual([
      { role: "system", content: "Stable rules.\n\nToday is X." },
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "how many customers?" },
      { role: "assistant", content: "Let me check.", tool_calls: [{ id: "t1", type: "function", function: { name: "query_data", arguments: "{\"entity\":\"contacts\"}" } }] },
      { role: "tool", tool_call_id: "t1", content: "{\"matching\":3}" },
      { role: "tool", tool_call_id: "t2", content: "Error: boom" },
    ]);
  });

  it("reads text, tool calls and stop reasons from a response", () => {
    const tools = fromChatResponse({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", function: { name: "query_data", arguments: "{\"entity\":\"leads\"}" } }, { function: { name: "my_tasks", arguments: "not json" } }] } }] });
    expect(tools.stop_reason).toBe("tool_use");
    expect(tools.content[0]).toEqual({ type: "tool_use", id: "c1", name: "query_data", input: { entity: "leads" } });
    expect(tools.content[1]).toMatchObject({ type: "tool_use", name: "my_tasks", input: {} }); // unreadable arguments become an empty input the server then rejects
    expect(fromChatResponse({ choices: [{ finish_reason: "stop", message: { content: "Hello" } }] })).toEqual({ stop_reason: "end_turn", content: [{ type: "text", text: "Hello" }] });
    expect(fromChatResponse({ choices: [{ finish_reason: "length", message: { content: "Cut off…" } }] }).stop_reason).toBe("max_tokens");
    expect(() => fromChatResponse({ choices: [] })).toThrow(/no answer/);
  });
});
