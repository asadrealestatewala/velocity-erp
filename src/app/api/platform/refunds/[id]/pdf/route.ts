import { NextResponse, type NextRequest } from "next/server";
import { adminCan, getAdmin } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { creditNoteNumber } from "@/server/platform/billing";
import { renderCreditNotePdf } from "@/server/platform/credit-note-pdf";

export const dynamic = "force-dynamic";

/** Any credit note, for platform staff with payments access. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.role, "payments.manage")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const r = await platformDb().refund.findUnique({ where: { id }, include: { invoice: { include: { tenant: true } } } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderCreditNotePdf(r, r.invoice, r.invoice.tenant);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${creditNoteNumber(r.number)}.pdf"`, "Cache-Control": "private, no-store" } });
}
