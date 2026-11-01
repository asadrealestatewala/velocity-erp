import { NextResponse, type NextRequest } from "next/server";
import { renderPdf, pdfMoney, pdfTable } from "@/server/pdf";
import { pdfResponse, salesPdfScope } from "@/server/sales-pdf-access";
import { findReturn } from "@/server/services/returns";
import { fmtDate } from "@/lib/utils";
import { REFUND_METHOD_LABEL, RETURN_STATUS } from "@/lib/ops-constants";

export const runtime = "nodejs";

/** Return & refund note (credit note) for a customer return. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await salesPdfScope();
  const r = scope ? await findReturn({ id, ...scope }) : null;
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cur = r.currency;
  const pdf = await renderPdf(
    {
      title: `Return & refund note RET-${r.number}`,
      subtitle: r.invoice.sellerName,
      meta: [
        ["Status", RETURN_STATUS[r.status]?.label ?? r.status],
        ["Date", fmtDate(r.createdAt)],
        ["Against invoice", `INV-${r.invoice.number}`],
        ["Customer", r.invoice.buyerName],
        ["Seller NTN", r.invoice.sellerNtn ?? "-"],
        ["Customer NTN", r.invoice.buyerNtn ?? "-"],
        ["Refund method", r.refundMethod ? REFUND_METHOD_LABEL[r.refundMethod] : "-"],
        ["Restocked", r.restock ? "Yes" : "No"],
      ],
    },
    (doc) => {
      pdfTable(
        doc,
        [{ header: "Item", width: 250 }, { header: "Code", width: 90 }, { header: "Qty returned", width: 80, align: "right" }, { header: "Refund", width: 100, align: "right" }],
        r.lines.map((l) => [l.invoiceLine.name, l.invoiceLine.code ?? "", String(l.quantity), pdfMoney(l.amount, cur)]),
        { footerRows: [["", "", "Total refund", pdfMoney(r.refundAmount, cur)]] },
      );
      doc.moveDown(1).font("Helvetica-Bold").fontSize(9).text("Reason");
      doc.font("Helvetica").fontSize(9).text(r.reason);
      doc.moveDown(0.5).font("Helvetica").fontSize(8).fillColor("#667085").text(`Refund includes the item's share of the invoice discount and ${Number(r.invoice.taxRate)}% sales tax.`);
    },
  );
  return pdfResponse(pdf, `RET-${r.number}.pdf`);
}
