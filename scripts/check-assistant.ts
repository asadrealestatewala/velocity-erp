/**
 * Checks the AI connection the assistant will use: reads .env, sends one tiny request to the model and says whether it
 * worked. It never prints the key. Run it after adding the settings:   npm run assistant:check
 *
 * Works for both ways of connecting: ANTHROPIC_API_KEY (Claude), or ASSISTANT_PROVIDER=openai-compatible with
 * ASSISTANT_BASE_URL / ASSISTANT_MODEL / ASSISTANT_API_KEY (Google Gemini, Groq, OpenRouter, OpenAI, a local Ollama…).
 */
import Anthropic from "@anthropic-ai/sdk";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — the variables may still be set in the environment
}

async function checkOpenAiCompatible() {
  const base = (process.env.ASSISTANT_BASE_URL ?? "").replace(/\/+$/, "");
  const model = process.env.ASSISTANT_MODEL ?? "";
  if (!base || !model) {
    console.error("✗ ASSISTANT_PROVIDER=openai-compatible also needs ASSISTANT_BASE_URL and ASSISTANT_MODEL (see .env.example).");
    process.exit(1);
  }
  console.log(`Checking the assistant's AI connection (${model} at ${base}) …`);
  const key = process.env.ASSISTANT_API_KEY;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        tools: [{ type: "function", function: { name: "ping", description: "Does nothing.", parameters: { type: "object", properties: {} } } }],
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? "the key was rejected — check ASSISTANT_API_KEY" : res.status === 404 ? "the model or address wasn't found — check ASSISTANT_MODEL and ASSISTANT_BASE_URL" : res.status === 429 ? "rate limit or quota reached — try again shortly" : res.status === 400 || res.status === 422 ? "the service rejected the request — the model may not support tool calling" : "unexpected error";
      console.error(`✗ HTTP ${res.status}: ${hint}.\n  ${raw.slice(0, 300)}`);
      process.exit(1);
    }
    const json = JSON.parse(raw) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const reply = (json.choices?.[0]?.message?.content ?? "").trim();
    console.log(`✓ Connected. The model answered: “${reply.slice(0, 40)}” (${json.usage?.prompt_tokens ?? "?"} in / ${json.usage?.completion_tokens ?? "?"} out tokens), and accepted a tool definition.`);
    console.log("  Restart the app if it was already running so it picks up the settings; the assistant header will then read “AI connected”.");
  } catch (e) {
    console.error(`✗ Couldn't reach ${base}: ${(e as Error).message}. Check the address and this machine's internet connection.`);
    process.exit(1);
  }
}

async function checkAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!key) {
    console.error("✗ No AI is configured. Set ANTHROPIC_API_KEY, or ASSISTANT_PROVIDER=openai-compatible with ASSISTANT_BASE_URL, ASSISTANT_MODEL and ASSISTANT_API_KEY, in the .env file on the server (see .env.example), restart the app, then run this check again.");
    process.exit(1);
  }
  const model = process.env.ASSISTANT_MODEL || "claude-opus-5-5";
  console.log(`Checking the assistant's AI connection (model: ${model}) …`);
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    const reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
    console.log(`✓ Connected. The model answered: “${reply.slice(0, 40)}” (${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens).`);
    console.log("  Restart the app if it was already running so it picks up the key, then open the assistant — its status will read “AI connected”.");
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("✗ The key was rejected (authentication failed). Check ANTHROPIC_API_KEY for typos or a revoked key.");
    else if (e instanceof Anthropic.NotFoundError) console.error(`✗ The model “${model}” isn't available to this key. Set ASSISTANT_MODEL to a model your account can use.`);
    else if (e instanceof Anthropic.RateLimitError) console.error("✗ The key works but is being rate limited or is out of credit right now. Check usage and billing in the Anthropic console.");
    else if (e instanceof Anthropic.APIConnectionError) console.error("✗ Couldn't reach the Anthropic API. Check this machine's internet connection or proxy.");
    else if (e instanceof Anthropic.APIError) console.error(`✗ The API returned an error (${e.status ?? "unknown"}): ${e.message}`);
    else console.error("✗ Unexpected error:", e);
    process.exit(1);
  }
}

void (process.env.ASSISTANT_PROVIDER === "openai-compatible" ? checkOpenAiCompatible() : checkAnthropic());
