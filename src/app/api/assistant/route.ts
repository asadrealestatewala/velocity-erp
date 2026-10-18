import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { can } from "@/server/authz";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { describeLlmError, runAssistant } from "@/server/assistant/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) })).max(40).default([]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!can(user, "assistant.use")) return NextResponse.json({ error: "The assistant isn't enabled for your role." }, { status: 403 });
  // Origin check: only the app's own pages may call this (cookie-authenticated, state-light but costs money).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  if (!(await rateLimit(`assistant:${user.id}`, 40, 10 * 60))) return NextResponse.json({ error: "You're sending messages quickly — please wait a few minutes." }, { status: 429 });

  try {
    const reply = await runAssistant(user, parsed.data.history, parsed.data.message);
    return NextResponse.json(reply);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    const friendly = describeLlmError(e);
    if (!friendly) console.error("[assistant]", e);
    return NextResponse.json({ error: friendly ?? "The assistant ran into a problem. Please try again." }, { status: 502 });
  }
}
