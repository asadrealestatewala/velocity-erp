import { NextResponse, type NextRequest } from "next/server";
import { renderPdf, pdfMoney, pdfTable } from "@/server/pdf";
import { pdfResponse, salesPdfScope } from "@/server/sales-pdf-access";
import { findInvoice } from "@/server/services/invoices";
import { fmtDate } from "@/lib/utils";
import { INVOICE_STATUS } from "@/lib/ops-constants";

export const runtime = "nodejs";

/** A sales tax invoice carrying the seller's and buyer's NTN/STRN as they were when it was issued. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await salesPdfScope();
  const inv = scope ? await findInvoice({ id, ...scope }) : null;
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cur = inv.currency;
  const refunded = inv.returns.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + Number(r.refundAmount), 0);
  const pdf = await renderPdf(
    {
      title: `${Number(inv.taxRate) > 0 ? "Sales tax invoice" : "Invoice"} INV-${inv.number}`,
      subtitle: inv.sellerName,
      meta: [
        ["Status", INVOICE_STATUS[inv.status]?.label ?? inv.status],
        ["Invoice date", fmtDate(inv.invoiceDate)],
        ["Seller", inv.sellerName],
        ["Seller NTN", inv.sellerNtn ?? "-"],
        ["Seller STRN", inv.sellerStrn ?? "-"],
        ["Seller address", inv.sellerAddress ?? "-"],
        ["Buyer", inv.buyerName],
        ["Buyer NTN", inv.buyerNtn ?? "-"],
        ["Buyer CNIC", inv.buyerCnic ?? "-"],
        ["Buyer address", inv.buyerAddress ?? "-"],
        ["Order", `SO-${inv.salesOrder.number}`],
        ["Due date", inv.dueDate ? fmtDate(inv.dueDate) : "-"],
      ],
    },
    (doc) => {
      pdfTable(
        doc,
        [{ header: "Item", width: 215 }, { header: "Code", width: 85 }, { header: "Qty", width: 45, align: "right" }, { header: "Unit price", width: 85, align: "right" }, { header: "Line total", width: 85, align: "right" }],
        inv.lines.map((l) => [l.name, l.code ?? "", String(l.quantity), pdfMoney(l.unitPrice, cur), pdfMoney(l.lineTotal, cur)]),
        {
          footerRows: [
            ["", "", "", "Subtotal", pdfMoney(inv.subtotal, cur)],
            ...(Number(inv.discount) > 0 ? [["", "", "", "Discount", `- ${pdfMoney(inv.discount, cur)}`]] : []),
            ["", "", "", `Sales tax (${Number(inv.taxRate)}%)`, pdfMoney(inv.taxAmount, cur)],
            ["", "", "", "Total", pdfMoney(inv.total, cur)],
            ...(refunded > 0 ? [["", "", "", "Refunded", `- ${pdfMoney(refunded, cur)}`]] : []),
          ],
        },
      );
      if (inv.status === "VOID") doc.moveDown(1).font("Helvetica-Bold").fontSize(10).fillColor("#b42318").text(`VOID${inv.voidReason ? ` - ${inv.voidReason}` : ""}`);
      if (inv.notes) {
        doc.moveDown(1).font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text("Notes");
        doc.font("Helvetica").fontSize(9).text(inv.notes);
      }
    },
  );
  return pdfResponse(pdf, `INV-${inv.number}.pdf`);
}
