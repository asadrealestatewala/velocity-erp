import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";
import { renderPdf, pdfMoney, pdfTable } from "@/server/pdf";
import { fmtDate, fullName } from "@/lib/utils";
import { SALES_ORDER_STATUS } from "@/lib/ops-constants";

export const runtime = "nodejs";

/** A customer order as a PDF. Dealership users get their own dealership's orders; central staff with inventory oversight get any. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const central = isCentral(user) && can(user, "inventory.view_all");
  if (!central && !(can(user, "inventory.view") && dealershipIds(user).length)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const order = await db.salesOrder.findFirst({
    where: { id, ...(central ? {} : { dealershipId: { in: dealershipIds(user) } }) },
    include: { lines: true, dealership: { select: { name: true, address: true, phone: true, city: { select: { name: true } } } }, contact: { select: { firstName: true, lastName: true, phone: true } } },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cur = order.currency;
  const pdf = await renderPdf(
    {
      title: `Customer order SO-${order.number}`,
      subtitle: order.dealership.name,
      meta: [
        ["Status", SALES_ORDER_STATUS[order.status]?.label ?? order.status],
        ["Order date", fmtDate(order.orderDate)],
        ["Customer", order.contact ? fullName(order.contact) : order.customerName ?? "-"],
        ["Phone", order.contact?.phone ?? "-"],
        ["Showroom", `${order.dealership.name}, ${order.dealership.city.name}`],
        ["Showroom phone", order.dealership.phone ?? "-"],
      ],
    },
    (doc) => {
      pdfTable(
        doc,
        [{ header: "Item", width: 215 }, { header: "Code", width: 85 }, { header: "Qty", width: 45, align: "right" }, { header: "Unit price", width: 85, align: "right" }, { header: "Line total", width: 85, align: "right" }],
        order.lines.map((l) => [l.name, l.code ?? "", String(l.quantity), pdfMoney(l.unitPrice, cur), pdfMoney(l.lineTotal, cur)]),
        {
          footerRows: [
            ["", "", "", "Subtotal", pdfMoney(order.subtotal, cur)],
            ...(Number(order.discount) > 0 ? [["", "", "", "Discount", `- ${pdfMoney(order.discount, cur)}`]] : []),
            ["", "", "", "Total", pdfMoney(order.total, cur)],
          ],
        },
      );
      if (order.notes) {
        doc.moveDown(1).font("Helvetica-Bold").fontSize(9).text("Notes");
        doc.font("Helvetica").fontSize(9).text(order.notes);
      }
    },
  );
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="SO-${order.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
