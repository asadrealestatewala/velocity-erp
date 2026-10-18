import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { applyStatusUpdate, recordInbound } from "@/server/services/messages";
import { verifyWhatsAppHandshake, verifyWhatsAppSignature, whatsappWebhookConfigured } from "@/server/messaging/providers";

export const runtime = "nodejs";

/** Meta's subscribe handshake. */
export async function GET(req: NextRequest) {
  if (!whatsappWebhookConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  if (!verifyWhatsAppHandshake(q.get("hub.mode"), q.get("hub.verify_token"))) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

type WaPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { id: string; from: string; timestamp?: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
        statuses?: { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string }[] }[];
      };
    }[];
  }[];
};

/** Inbound messages and delivery receipts. Every request must carry a valid signature from Meta. */
export async function POST(req: NextRequest) {
  if (!whatsappWebhookConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const raw = await req.text();
  if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("Invalid signature", { status: 401 });
  let payload: WaPayload;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  let stored = 0, unmatched = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      for (const s of v?.statuses ?? []) {
        const at = new Date(Number(s.timestamp ?? 0) * 1000 || Date.now());
        const map: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
        const status = map[s.status];
        if (status) await applyStatusUpdate("WHATSAPP", s.id, status, at, s.errors?.[0]?.message ?? s.errors?.[0]?.title);
      }
      for (const m of v?.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type} message — open WhatsApp to view]`;
        const digits = m.from.replace(/\D/g, "");
        // Several contacts may share a number: the most recently active one gets the conversation.
        const contact = await db.contact.findFirst({ where: { phoneNormalized: digits, isArchived: false }, orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], select: { id: true, firstName: true, lastName: true } });
        if (!contact) {
          unmatched++;
          await audit({ action: "message.inbound_unmatched", entityType: "Contact", dealershipId: null, changes: { channel: "WHATSAPP", number: `…${digits.slice(-4)}` } });
          continue;
        }
        const res = await recordInbound({ channel: "WHATSAPP", externalId: m.id, contact, body: text, address: digits, at: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()) });
        if (!res.duplicate) stored++;
      }
    }
  }
  // Always 200 once the signature is valid so Meta does not retry what we deliberately ignored.
  return NextResponse.json({ ok: true, stored, unmatched });
}
