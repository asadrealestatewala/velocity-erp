import { NextResponse, type NextRequest } from "next/server";
import { adminCan, getAdmin } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { invoiceNumber } from "@/server/platform/billing";
import { renderInvoicePdf } from "@/server/platform/invoice-pdf";

export const dynamic = "force-dynamic";

/** Any invoice, for platform staff with payments access. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.role, "payments.manage")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const inv = await platformDb().invoice.findUnique({ where: { id }, include: { refunds: true, tenant: true } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderInvoicePdf(inv, inv.tenant);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoiceNumber(inv.number)}.pdf"`, "Cache-Control": "private, no-store" } });
}
