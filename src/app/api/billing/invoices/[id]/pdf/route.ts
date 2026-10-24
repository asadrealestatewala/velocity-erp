import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/authz";
import { platformDb } from "@/server/platform/client";
import { invoiceNumber } from "@/server/platform/billing";
import { renderInvoicePdf } from "@/server/platform/invoice-pdf";
import { currentTenant } from "@/server/platform/runtime";

export const dynamic = "force-dynamic";

/** A workspace's own invoices only (settings.manage). The invoice must belong to the workspace of the signed-in user. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser("settings.manage");
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const t = await currentTenant();
  const inv = await platformDb().invoice.findFirst({ where: { id, tenantId: t.id }, include: { refunds: true } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderInvoicePdf(inv, t);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoiceNumber(inv.number)}.pdf"`, "Cache-Control": "private, no-store" } });
}
