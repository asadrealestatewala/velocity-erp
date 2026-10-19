/**
 * Checks the AI key the assistant will use: reads .env, sends one tiny request to the model and says whether it worked.
 * It never prints the key. Run it after adding ANTHROPIC_API_KEY:   npm run assistant:check
 */
import Anthropic from "@anthropic-ai/sdk";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — the variable may still be set in the environment
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!key) {
    console.error("✗ ANTHROPIC_API_KEY is not set.\n  Add it to the .env file on the server (see .env.example), restart the app, then run this check again.");
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

void main();
