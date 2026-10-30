import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";
import { audit } from "@/server/audit";
import { parseDay } from "@/server/ops-access";
import { PAYMENT_METHOD_LABEL, VOUCHER_DOC_KIND, VOUCHER_KIND, VOUCHER_STATUS } from "@/lib/ops-constants";
import { isoDay } from "@/lib/utils";

export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Expense vouchers (with tax amounts and the documents on file) as a spreadsheet for tax records. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user) return notFound();
  const q = req.nextUrl.searchParams;
  const central = isCentral(user);
  if (central ? !can(user, "vouchers.view_all") : !(can(user, "vouchers.manage") && dealershipIds(user).length)) return notFound();

  const requested = q.get("dealership");
  let scope: Prisma.ExpenseVoucherWhereInput;
  if (central) scope = requested ? { dealershipId: requested } : {};
  else {
    const ids = dealershipIds(user);
    if (requested && !ids.includes(requested)) return notFound();
    scope = { dealershipId: requested ?? { in: ids } };
  }
  const from = parseDay(q.get("from"));
  const to = parseDay(q.get("to"), true);
  const status = q.get("status");
  const where: Prisma.ExpenseVoucherWhereInput = {
    ...scope,
    ...(from || to ? { voucherDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(status && status in VOUCHER_STATUS ? { status: status as "SUBMITTED" | "APPROVED" | "REJECTED" } : {}),
  };
  const rows = await db.expenseVoucher.findMany({
    where, orderBy: [{ voucherDate: "asc" }, { number: "asc" }],
    include: { dealership: { select: { name: true, code: true } }, attachments: { select: { kind: true } } },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Velocity ERP";
  const ws = wb.addWorksheet("Vouchers", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow(["YADEA - expense vouchers for tax records"]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC - ${rows.length} voucher${rows.length === 1 ? "" : "s"}`]);
  const head = ws.addRow(["Voucher no.", "Date", "Dealership", "Type", "Category", "Paid to", "Reference", "Method", "Amount (PKR)", "Tax (PKR)", "Net of tax (PKR)", "Status", "Documents on file", "Review note"]);
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FB" } }; });
  for (const v of rows) {
    const kinds = [...new Set(v.attachments.map((a) => VOUCHER_DOC_KIND[a.kind]))].join(", ");
    ws.addRow([
      `EV-${v.number}`, v.voucherDate, `${v.dealership.name} (${v.dealership.code})`, VOUCHER_KIND[v.kind], v.category, v.payee ?? "", v.reference ?? "",
      v.method ? PAYMENT_METHOD_LABEL[v.method] : "", Number(v.amount), Number(v.taxAmount), Number(v.amount) - Number(v.taxAmount),
      VOUCHER_STATUS[v.status]?.label ?? v.status, v.attachments.length ? `${v.attachments.length} (${kinds})` : "None", v.reviewNote ?? "",
    ]);
  }
  if (rows.length) {
    const t = ws.addRow(["Totals", "", "", "", "", "", "", "", { formula: `SUM(I4:I${3 + rows.length})` }, { formula: `SUM(J4:J${3 + rows.length})` }, { formula: `SUM(K4:K${3 + rows.length})` }]);
    t.font = { bold: true };
  }
  ws.columns = [{ width: 12 }, { width: 13 }, { width: 30 }, { width: 18 }, { width: 24 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 38 }, { width: 30 }];
  ws.getColumn(2).numFmt = "dd mmm yyyy";
  for (const c of [9, 10, 11]) ws.getColumn(c).numFmt = "#,##0.00";

  await audit({ userId: user.id, dealershipId: requested ?? (central ? null : dealershipIds(user)[0] ?? null), action: "voucher.exported", entityType: "ExpenseVoucher", changes: { rows: rows.length } });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="vouchers-${isoDay(new Date())}.xlsx"`, "Cache-Control": "private, no-store" } });
}
