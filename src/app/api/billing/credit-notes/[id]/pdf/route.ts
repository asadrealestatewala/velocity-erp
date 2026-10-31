import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/authz";
import { platformDb } from "@/server/platform/client";
import { creditNoteNumber } from "@/server/platform/billing";
import { renderCreditNotePdf } from "@/server/platform/credit-note-pdf";
import { currentTenant } from "@/server/platform/runtime";

export const dynamic = "force-dynamic";

/** A workspace's own credit notes only (settings.manage): the refund's invoice must belong to the signed-in user's workspace. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser("settings.manage");
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const t = await currentTenant();
  const r = await platformDb().refund.findFirst({ where: { id, invoice: { tenantId: t.id } }, include: { invoice: true } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderCreditNotePdf(r, r.invoice, t);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${creditNoteNumber(r.number)}.pdf"`, "Cache-Control": "private, no-store" } });
}
