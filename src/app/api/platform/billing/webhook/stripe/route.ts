import { NextResponse, type NextRequest } from "next/server";
import { decryptSecret } from "@/server/platform/crypto";
import { getPlatformSettings } from "@/server/platform/settings";
import { logError } from "@/server/platform/ops-log";
import { handleStripeEvent, verifyStripeSignature } from "@/server/platform/stripe";

export const dynamic = "force-dynamic";

/** Stripe → platform. Signature-verified (5-minute window) and idempotent per event id. Register this URL in the Stripe dashboard. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const settings = await getPlatformSettings();
  const secret = settings.billing.stripeWebhookSecretEnc ? decryptSecret(settings.billing.stripeWebhookSecretEnc) : process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  try {
    const event = JSON.parse(raw);
    try {
      const result = await handleStripeEvent(event);
      return NextResponse.json({ received: true, result });
    } catch (e) {
      await logError("webhook.stripe", e, { detail: { eventId: event?.id, type: event?.type } });
      throw e;
    }
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Stripe retries
  }
}
