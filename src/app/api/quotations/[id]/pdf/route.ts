import { NextResponse, type NextRequest } from "next/server";
import { renderPdf, pdfMoney, pdfTable } from "@/server/pdf";
import { pdfResponse, salesPdfScope } from "@/server/sales-pdf-access";
import { findQuotation, isExpired } from "@/server/services/quotations";
import { fmtDate, fullName } from "@/lib/utils";
import { QUOTATION_STATUS } from "@/lib/ops-constants";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await salesPdfScope();
  const q = scope ? await findQuotation({ id, ...scope }) : null;
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cur = q.currency;
  const pdf = await renderPdf(
    {
      title: `Quotation QT-${q.number}`,
      subtitle: q.dealership.name,
      meta: [
        ["Status", isExpired(q) ? "Expired" : (QUOTATION_STATUS[q.status]?.label ?? q.status)],
        ["Date", fmtDate(q.quoteDate)],
        ["Prepared for", q.contact ? fullName(q.contact) : q.customerName ?? "-"],
        ["Valid until", q.validUntil ? fmtDate(q.validUntil) : "-"],
        ["Showroom", `${q.dealership.name}, ${q.dealership.city.name}`],
        ["Showroom phone", q.dealership.phone ?? "-"],
        ["Prepared by", q.createdBy.name],
      ],
    },
    (doc) => {
      pdfTable(
        doc,
        [{ header: "Item", width: 215 }, { header: "Code", width: 85 }, { header: "Qty", width: 45, align: "right" }, { header: "Unit price", width: 85, align: "right" }, { header: "Line total", width: 85, align: "right" }],
        q.lines.map((l) => [l.name, l.code ?? "", String(l.quantity), pdfMoney(l.unitPrice, cur), pdfMoney(l.lineTotal, cur)]),
        {
          footerRows: [
            ["", "", "", "Subtotal", pdfMoney(q.subtotal, cur)],
            ...(Number(q.discount) > 0 ? [["", "", "", "Discount", `- ${pdfMoney(q.discount, cur)}`]] : []),
            ["", "", "", "Total", pdfMoney(q.total, cur)],
          ],
        },
      );
      if (q.notes) {
        doc.moveDown(1).font("Helvetica-Bold").fontSize(9).text("Notes");
        doc.font("Helvetica").fontSize(9).text(q.notes);
      }
      doc.moveDown(1).font("Helvetica").fontSize(8).fillColor("#667085").text("This quotation is an offer, not a tax invoice. Prices are subject to stock availability and applicable taxes.");
    },
  );
  return pdfResponse(pdf, `QT-${q.number}.pdf`);
}
