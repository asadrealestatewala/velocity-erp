import { NextResponse, type NextRequest } from "next/server";
import { handleResendEvent, webhookSecret } from "@/server/platform/mail-inbox";
import { verifyResendSignature, type ResendEvent } from "@/server/platform/mail-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resend → platform: received mail (email.received) and delivery status (sent, delivered, bounced …).
 * Signature-verified (Svix scheme, 5-minute window) and idempotent. Register this URL in Resend → Webhooks.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = await webhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
  const ok = verifyResendSignature(raw, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, secret);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  let ev: ResendEvent;
  try {
    ev = JSON.parse(raw) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    return NextResponse.json({ received: true, result: await handleResendEvent(ev) });
  } catch (e) {
    console.error("[mail webhook]", (e as Error).message);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Resend retries
  }
}
