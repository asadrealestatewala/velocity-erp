import { NextResponse, type NextRequest } from "next/server";
import { decryptSecret } from "@/server/platform/crypto";
import { getPlatformSettings } from "@/server/platform/settings";
import { handleStripeEvent, verifyStripeSignature } from "@/server/platform/stripe";

export const dynamic = "force-dynamic";

/** Stripe → platform. Signature-verified (5-minute window) and idempotent per event id. Register this URL in the Stripe dashboard. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const settings = await getPlatformSettings();
  const secret = settings.billing.stripeWebhookSecretEnc ? decryptSecret(settings.billing.stripeWebhookSecretEnc) : process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  try {
    const result = await handleStripeEvent(JSON.parse(raw));
    return NextResponse.json({ received: true, result });
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Stripe retries
  }
}
