import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { recordInbound } from "@/server/services/messages";
import { emailInboundConfigured, verifyInboundEmailSecret } from "@/server/messaging/providers";
import { normalizeEmail } from "@/lib/utils";

export const runtime = "nodejs";

type Inbound = {
  // Generic shape
  from?: string; subject?: string; text?: string; messageId?: string; date?: string;
  // Postmark inbound shape
  From?: string; FromFull?: { Email?: string }; Subject?: string; TextBody?: string; MessageID?: string; Date?: string;
};

/** The sender's address out of `Name <a@b.com>` or a bare address. */
function senderAddress(raw: string | undefined) {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return normalizeEmail((m ? m[1] : raw)?.trim());
}

/**
 * Inbound email from a forwarding / inbound-parse service (e.g. Postmark, SendGrid, a custom mail rule).
 * Authenticated with the shared secret in the `x-webhook-secret` header. Accepts a simple JSON shape:
 *   { "from": "Name <a@b.com>", "subject": "...", "text": "...", "messageId": "<id>" }
 * or Postmark's inbound payload.
 */
export async function POST(req: NextRequest) {
  if (!emailInboundConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  if (!verifyInboundEmailSecret(req.headers.get("x-webhook-secret"))) return new NextResponse("Forbidden", { status: 403 });
  let p: Inbound;
  try {
    p = (await req.json()) as Inbound;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const email = normalizeEmail(p.FromFull?.Email) ?? senderAddress(p.from ?? p.From);
  const body = (p.text ?? p.TextBody ?? "").trim();
  const externalId = (p.messageId ?? p.MessageID ?? "").trim();
  if (!email || !body || !externalId) return NextResponse.json({ error: "from, text and messageId are required" }, { status: 400 });

  const contact = await db.contact.findFirst({ where: { emailNormalized: email, isArchived: false }, orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], select: { id: true, firstName: true, lastName: true } });
  if (!contact) {
    await audit({ action: "message.inbound_unmatched", entityType: "Contact", dealershipId: null, changes: { channel: "EMAIL" } });
    return NextResponse.json({ ok: true, stored: 0, unmatched: 1 });
  }
  const at = new Date(p.date ?? p.Date ?? Date.now());
  const res = await recordInbound({
    channel: "EMAIL", externalId, contact, body: body.slice(0, 20_000), subject: (p.subject ?? p.Subject ?? "").slice(0, 200) || null, address: email,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
  });
  return NextResponse.json({ ok: true, stored: res.duplicate ? 0 : 1, unmatched: 0 });
}
