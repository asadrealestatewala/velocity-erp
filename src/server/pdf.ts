import "server-only";
import path from "node:path";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { fmtDateTime } from "@/lib/utils";

// Small PDF toolkit (A4, YADEA header, paged tables, page-number footer) shared by the ledger, invoice and order exports.

export const PDF_COLORS = { ink: "#0f172a", muted: "#667085", line: "#d6dae1", band: "#f5f7fb", brand: "#3a66e6", accent: "#f07400" };

export type PdfCol = { header: string; width: number; align?: "left" | "right" | "center" };

export function pdfMoney(n: number | string | { toString(): string }, currency = "PKR") {
  const v = typeof n === "number" ? n : Number(n.toString());
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Text safe for the built-in Helvetica font (WinAnsi): replace characters it cannot draw. */
export function pdfText(s: string | null | undefined) {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/−/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff–—•€]/g, "?");
}

const MARGIN = 40;

export async function renderPdf(opts: { title: string; subtitle?: string; meta?: [string, string][] }, build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: pdfText(opts.title), Author: "YADEA CRM" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Header band
  const logo = path.join(process.cwd(), "public", "brand", "yadea-logo.png");
  if (existsSync(logo)) {
    try {
      doc.image(logo, MARGIN, MARGIN - 6, { fit: [110, 30] });
    } catch {
      doc.font("Helvetica-Bold").fontSize(18).fillColor(PDF_COLORS.accent).text("YADEA", MARGIN, MARGIN);
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(18).fillColor(PDF_COLORS.accent).text("YADEA", MARGIN, MARGIN);
  }
  doc.font("Helvetica-Bold").fontSize(15).fillColor(PDF_COLORS.ink).text(pdfText(opts.title), MARGIN, MARGIN - 4, { align: "right", width: doc.page.width - MARGIN * 2 });
  if (opts.subtitle) doc.font("Helvetica").fontSize(9.5).fillColor(PDF_COLORS.muted).text(pdfText(opts.subtitle), { align: "right", width: doc.page.width - MARGIN * 2 });
  doc.moveTo(MARGIN, MARGIN + 34).lineTo(doc.page.width - MARGIN, MARGIN + 34).lineWidth(2).strokeColor(PDF_COLORS.accent).stroke();
  doc.y = MARGIN + 46;
  doc.x = MARGIN;

  if (opts.meta?.length) {
    const colW = (doc.page.width - MARGIN * 2) / 2;
    const startY = doc.y;
    opts.meta.forEach(([k, v], i) => {
      const x = MARGIN + (i % 2) * colW;
      const y = startY + Math.floor(i / 2) * 16;
      doc.font("Helvetica").fontSize(9).fillColor(PDF_COLORS.muted).text(pdfText(k), x, y, { width: 90, continued: false });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF_COLORS.ink).text(pdfText(v), x + 92, y, { width: colW - 100 });
    });
    doc.y = startY + Math.ceil(opts.meta.length / 2) * 16 + 8;
    doc.x = MARGIN;
  }

  build(doc);

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN + 8;
    doc.font("Helvetica").fontSize(8).fillColor(PDF_COLORS.muted);
    doc.text(`Generated ${fmtDateTime(new Date())} - YADEA CRM`, MARGIN, y, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, y, { align: "right", width: doc.page.width - MARGIN * 2, lineBreak: false });
  }
  doc.end();
  return done;
}

/** Draws a table that flows across pages, repeating the header row. Returns nothing; advances doc.y. */
export function pdfTable(doc: PDFKit.PDFDocument, cols: PdfCol[], rows: string[][], opts: { footerRows?: string[][]; zebra?: boolean } = {}) {
  const bottom = () => doc.page.height - MARGIN - 18;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const pad = 4;

  const header = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, totalW, 20).fill(PDF_COLORS.band);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PDF_COLORS.ink);
    let x = MARGIN;
    for (const c of cols) {
      doc.text(pdfText(c.header), x + pad, y + 6, { width: c.width - pad * 2, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    }
    doc.y = y + 20;
  };

  const rowHeight = (cells: string[], bold: boolean) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    return Math.max(18, ...cells.map((t, i) => doc.heightOfString(pdfText(t) || " ", { width: cols[i]!.width - pad * 2 }) + 8));
  };

  const drawRow = (cells: string[], bold = false, index = 0) => {
    const h = rowHeight(cells, bold);
    if (doc.y + h > bottom()) {
      doc.addPage();
      doc.y = MARGIN;
      header();
    }
    const y = doc.y;
    if (opts.zebra && index % 2 === 1 && !bold) doc.rect(MARGIN, y, totalW, h).fill("#fafbfd");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(PDF_COLORS.ink);
    let x = MARGIN;
    cells.forEach((t, i) => {
      doc.text(pdfText(t), x + pad, y + 4, { width: cols[i]!.width - pad * 2, align: cols[i]!.align ?? "left" });
      x += cols[i]!.width;
    });
    doc.moveTo(MARGIN, y + h).lineTo(MARGIN + totalW, y + h).lineWidth(0.5).strokeColor(PDF_COLORS.line).stroke();
    doc.y = y + h;
  };

  header();
  if (rows.length === 0) drawRow(["No entries"].concat(cols.slice(1).map(() => "")));
  rows.forEach((r, i) => drawRow(r, false, i));
  for (const r of opts.footerRows ?? []) drawRow(r, true);
  doc.x = MARGIN;
}
