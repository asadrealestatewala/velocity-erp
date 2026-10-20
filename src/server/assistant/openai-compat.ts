import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Llm, LlmBlock, LlmRequest, LlmResponse } from "./engine";

/**
 * An adapter that lets the assistant run on any service that speaks the OpenAI "chat completions" protocol with tool
 * calling — Google Gemini, Groq, OpenRouter, OpenAI, or a local server such as Ollama / LM Studio — instead of Anthropic.
 * The assistant's own logic (permissions, tools, confirmation of changes) is identical; only the model behind it changes.
 *
 * Configure with ASSISTANT_PROVIDER=openai-compatible, ASSISTANT_BASE_URL, ASSISTANT_MODEL and (for hosted services)
 * ASSISTANT_API_KEY. The model must support tool / function calling.
 */

export class LlmProviderError extends Error {
  constructor(message: string, readonly status: number | null, readonly userMessage: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export const openAiCompatConfigured = () => process.env.ASSISTANT_PROVIDER === "openai-compatible" && !!process.env.ASSISTANT_BASE_URL && !!process.env.ASSISTANT_MODEL;

// ───────── Translating the request ─────────

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Providers disagree about JSON Schema: some reject `additionalProperties`, some reject a `type` given as a list. Both are
 * only hints here (the server validates every tool input with Zod anyway), so they are dropped.
 */
export function simplifySchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifySchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) continue;
    out[k] = simplifySchema(v);
  }
  return out;
}

const textOf = (blocks: Anthropic.ContentBlockParam[]) => blocks.filter((b): b is Anthropic.TextBlockParam => b.type === "text").map((b) => b.text).join("\n");

export function toChatMessages(req: LlmRequest): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: req.system.map((s) => s.text).join("\n\n") }];
  for (const m of req.messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content } as ChatMessage); continue; }
    const blocks = m.content as Anthropic.ContentBlockParam[];
    if (m.role === "assistant") {
      const calls = blocks.filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use").map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const text = textOf(blocks);
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const c = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x) => (x.type === "text" ? x.text : "")).join("\n") : "";
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${c}` : c });
      }
    }
    const text = textOf(blocks);
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

// ───────── Translating the response ─────────

type ChatResponse = {
  choices?: { finish_reason?: string | null; message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  error?: { message?: string };
};

export function fromChatResponse(res: ChatResponse): LlmResponse {
  const choice = res.choices?.[0];
  if (!choice?.message) throw new LlmProviderError("The provider returned no answer.", null, "The AI service returned an empty answer. Please try again.");
  const content: LlmBlock[] = [];
  if (choice.message.content) content.push({ type: "text", text: choice.message.content });
  let n = 0;
  for (const c of choice.message.tool_calls ?? []) {
    if (!c.function?.name) continue;
    let input: unknown = {};
    try { input = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch { input = {}; }
    content.push({ type: "tool_use", id: c.id || `call_${Date.now().toString(36)}_${n++}`, name: c.function.name, input });
  }
  const wantsTools = content.some((b) => b.type === "tool_use");
  return { stop_reason: wantsTools ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : "end_turn", content };
}

function failure(status: number, body: string): LlmProviderError {
  const detail = body.slice(0, 300);
  const msg =
    status === 401 || status === 403 ? "The AI key configured for this system was rejected. Ask your administrator to check ASSISTANT_API_KEY."
    : status === 404 ? "The AI model or address isn't available. Ask your administrator to check ASSISTANT_MODEL and ASSISTANT_BASE_URL."
    : status === 429 ? "The AI service is busy or its free quota is used up for now. Please try again in a moment."
    : status === 400 || status === 422 ? "The AI service rejected the request — the chosen model may not support tool calling. Ask your administrator to pick another model."
    : `The AI service returned an error (${status}). Please try again.`;
  return new LlmProviderError(`AI provider HTTP ${status}: ${detail}`, status, msg);
}

// ───────── The adapter ─────────

export function openAiCompatibleLlm(): Llm {
  const base = (process.env.ASSISTANT_BASE_URL ?? "").replace(/\/+$/, "");
  const model = process.env.ASSISTANT_MODEL ?? "";
  return {
    async create(req) {
      const body = {
        model,
        messages: toChatMessages(req),
        tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: simplifySchema(t.input_schema) } })),
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 4000,
      };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 90_000);
      try {
        const key = process.env.ASSISTANT_API_KEY;
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        const raw = await res.text();
        if (!res.ok) throw failure(res.status, raw);
        let json: ChatResponse;
        try { json = JSON.parse(raw) as ChatResponse; } catch { throw new LlmProviderError("The provider returned a response that isn't JSON.", res.status, "The AI service returned an unreadable answer. Please try again."); }
        return fromChatResponse(json);
      } catch (e) {
        if (e instanceof LlmProviderError) throw e;
        if ((e as Error).name === "AbortError") throw new LlmProviderError("The AI provider timed out.", null, "The AI service took too long to answer. Please try again.");
        throw new LlmProviderError(`Couldn't reach the AI provider: ${(e as Error).message}`, null, "Couldn't reach the AI service. Please try again.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
