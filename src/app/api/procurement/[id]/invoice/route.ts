import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";
import { pdfMoney, pdfTable, renderPdf } from "@/server/pdf";
import { fmtDate } from "@/lib/utils";

export const runtime = "nodejs";

/** The invoice YADEA raised for a dispatched stock order. Dealers get their own; central staff need ledger or procurement access. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user) return notFound();
  const central = isCentral(user) && (can(user, "ledger.view") || can(user, "procurement.view"));
  const dealer = !isCentral(user) && can(user, "ledger.view");
  if (!central && !dealer) return notFound();

  const order = await db.procurementOrder.findFirst({
    where: { id, ...(central ? {} : { dealershipId: { in: dealershipIds(user) } }) },
    include: { lines: true, dealership: { select: { name: true, code: true, address: true, phone: true, city: { select: { name: true } } } }, invoiceEntry: true },
  });
  if (!order || !order.invoiceEntry) return notFound();
  const cur = order.currency;
  const inv = order.invoiceEntry;

  const pdf = await renderPdf(
    {
      title: `Invoice INV-${inv.number}`,
      subtitle: `Stock order PO-${order.number}`,
      meta: [
        ["Billed to", order.dealership.name],
        ["Dealer code", order.dealership.code],
        ["Address", [order.dealership.address, order.dealership.city.name].filter(Boolean).join(", ") || "-"],
        ["Invoice date", fmtDate(inv.entryDate)],
        ["Order placed", fmtDate(order.submittedAt)],
        ["Dispatched", fmtDate(order.dispatchedAt)],
        ["Courier", order.courier ?? "-"],
        ["Tracking no.", order.trackingNumber ?? "-"],
      ],
    },
    (doc) => {
      pdfTable(
        doc,
        [{ header: "Item", width: 215 }, { header: "Code", width: 85 }, { header: "Qty", width: 45, align: "right" }, { header: "Unit price", width: 85, align: "right" }, { header: "Amount", width: 85, align: "right" }],
        order.lines.map((l) => [l.name, l.code ?? "", String(l.quantity), pdfMoney(l.unitPrice, cur), pdfMoney(l.lineTotal, cur)]),
        { footerRows: [["", "", "", "Total due", pdfMoney(order.subtotal, cur)]] },
      );
      doc.moveDown(1.2).font("Helvetica").fontSize(8.5).fillColor("#667085").text("Payments are recorded in the dealer account ledger. Quote the PO number as the payment reference.", { width: 515 });
    },
  );
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="INV-${inv.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
