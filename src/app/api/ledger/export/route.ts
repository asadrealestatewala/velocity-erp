import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, isCentral } from "@/server/authz";
import { audit } from "@/server/audit";
import { balancesByDealership, ledgerStatement } from "@/server/services/ledger";
import { exportDealership, parseDay } from "@/server/ops-access";
import { PDF_COLORS, pdfMoney, pdfTable, renderPdf } from "@/server/pdf";
import { LEDGER_STATUS, LEDGER_TYPE, PAYMENT_METHOD_LABEL } from "@/lib/ops-constants";
import { fmtDate, isoDay } from "@/lib/utils";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Dealer account ledger as Excel or PDF.
 *   ?dealership=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&format=xlsx|pdf
 *   ?scope=all&format=xlsx  (central only: every dealership's balance)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return notFound();
  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "pdf" ? "pdf" : "xlsx";

  if (q.get("scope") === "all") {
    if (!isCentral(user) || !can(user, "ledger.view") || format !== "xlsx") return notFound();
    const [dealers, balances] = await Promise.all([db.dealership.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, city: { select: { name: true } } } }), balancesByDealership()]);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Velocity ERP";
    const ws = wb.addWorksheet("Dealer balances", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.addRow(["YADEA - dealer account balances"]).font = { bold: true, size: 14 };
    ws.addRow([`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`]);
    const head = ws.addRow(["Dealership", "Code", "City", "Invoiced (PKR)", "Paid & verified (PKR)", "Balance owed (PKR)", "Awaiting verification (PKR)"]);
    head.font = { bold: true };
    head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FB" } }; });
    for (const d of dealers) {
      const b = balances.get(d.id);
      ws.addRow([d.name, d.code, d.city.name, b?.debit ?? 0, b?.credit ?? 0, b?.balance ?? 0, b?.pending ?? 0]);
    }
    ws.columns = [{ width: 34 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 26 }];
    for (const c of [4, 5, 6, 7]) ws.getColumn(c).numFmt = "#,##0.00";
    const total = ws.addRow(["Total", "", "", { formula: `SUM(D4:D${3 + dealers.length})` }, { formula: `SUM(E4:E${3 + dealers.length})` }, { formula: `SUM(F4:F${3 + dealers.length})` }, { formula: `SUM(G4:G${3 + dealers.length})` }]);
    total.font = { bold: true };
    await audit({ userId: user.id, dealershipId: null, action: "ledger.exported", entityType: "LedgerEntry", changes: { scope: "all", format } });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="dealer-balances-${isoDay(new Date())}.xlsx"`, "Cache-Control": "private, no-store" } });
  }

  const dealer = await exportDealership(user, q.get("dealership"), "ledger.view", "ledger.view");
  if (!dealer) return notFound();
  const from = parseDay(q.get("from"));
  const to = parseDay(q.get("to"), true);
  const stmt = await ledgerStatement(dealer.id, { from, to });
  const period = from || to ? `${from ? fmtDate(from) : "start"} to ${to ? fmtDate(to) : "today"}` : "All time";
  const fileBase = `ledger-${dealer.code}-${isoDay(new Date())}`;
  await audit({ userId: user.id, dealershipId: dealer.id, action: "ledger.exported", entityType: "Dealership", entityId: dealer.id, changes: { format, period } });

  if (format === "pdf") {
    const pdf = await renderPdf(
      { title: "Account statement", subtitle: dealer.name, meta: [["Dealership", `${dealer.name} (${dealer.code})`], ["Period", period], ["Opening balance", pdfMoney(stmt.openingBalance)], ["Closing balance", pdfMoney(stmt.closingBalance)]] },
      (doc) => {
        pdfTable(
          doc,
          [
            { header: "Date", width: 52 }, { header: "No.", width: 30 }, { header: "Type", width: 58 }, { header: "Reference / description", width: 150 },
            { header: "Debit", width: 62, align: "right" }, { header: "Credit", width: 62, align: "right" }, { header: "Balance", width: 66, align: "right" }, { header: "Status", width: 35 },
          ],
          stmt.rows.map((r) => [
            fmtDate(r.date), `#${r.number}`, LEDGER_TYPE[r.type]?.label ?? r.type,
            [r.reference, r.description, r.method ? PAYMENT_METHOD_LABEL[r.method] : null].filter(Boolean).join(" - "),
            r.debit ? pdfMoney(r.debit).replace("PKR ", "") : "", r.credit ? pdfMoney(r.credit).replace("PKR ", "") : "",
            r.status === "POSTED" ? pdfMoney(r.balance).replace("PKR ", "") : "-", r.status === "POSTED" ? "Posted" : r.status === "REJECTED" ? "Rejected" : "Pending",
          ]),
          { zebra: true, footerRows: [["", "", "", "Totals (posted)", pdfMoney(stmt.totalDebit).replace("PKR ", ""), pdfMoney(stmt.totalCredit).replace("PKR ", ""), pdfMoney(stmt.closingBalance).replace("PKR ", ""), ""]] },
        );
        doc.moveDown(0.8).font("Helvetica").fontSize(8).fillColor(PDF_COLORS.muted).text("Amounts in PKR. Pending and rejected payments are listed for transparency but do not affect the balance until verified by YADEA accounts.", { width: 515 });
      },
    );
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"`, "Cache-Control": "private, no-store" } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Velocity ERP";
  const ws = wb.addWorksheet("Ledger", { views: [{ state: "frozen", ySplit: 6 }] });
  ws.addRow([`YADEA - account statement: ${dealer.name} (${dealer.code})`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${period}`]);
  ws.addRow(["Opening balance (PKR)", stmt.openingBalance]);
  ws.addRow(["Closing balance (PKR)", stmt.closingBalance]);
  ws.addRow(["Pending and rejected payments are listed but do not affect the running balance."]).font = { italic: true, color: { argb: "FF667085" } };
  const head = ws.addRow(["Date", "Entry no.", "Type", "Reference", "Description", "Method", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)", "Status", "Proof attached"]);
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FB" } }; c.border = { bottom: { style: "thin", color: { argb: "FFD6DAE1" } } }; });
  for (const r of stmt.rows) {
    ws.addRow([
      r.date, r.number, LEDGER_TYPE[r.type]?.label ?? r.type, r.reference ?? "", r.description, r.method ? PAYMENT_METHOD_LABEL[r.method] : "",
      r.debit || null, r.credit || null, r.status === "POSTED" ? r.balance : null, LEDGER_STATUS[r.status]?.label ?? r.status, r.hasProof ? "Yes" : "",
    ]);
  }
  const first = 7, last = 6 + stmt.rows.length;
  const total = ws.addRow(["Totals (posted)", "", "", "", "", "", stmt.rows.length ? { formula: `SUMIFS(G${first}:G${last},J${first}:J${last},"Posted")`, result: stmt.totalDebit } : 0, stmt.rows.length ? { formula: `SUMIFS(H${first}:H${last},J${first}:J${last},"Posted")`, result: stmt.totalCredit } : 0, stmt.closingBalance]);
  total.font = { bold: true };
  ws.columns = [{ width: 13 }, { width: 11 }, { width: 14 }, { width: 22 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 22 }, { width: 14 }];
  ws.getColumn(1).numFmt = "dd mmm yyyy";
  for (const c of [7, 8, 9]) ws.getColumn(c).numFmt = "#,##0.00";
  ws.getCell("B3").numFmt = "#,##0.00";
  ws.getCell("B4").numFmt = "#,##0.00";
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`, "Cache-Control": "private, no-store" } });
}
