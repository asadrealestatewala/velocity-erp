import "server-only";
import PDFDocument from "pdfkit";
import type { Invoice, Refund, Tenant } from "@yadea/platform-client";
import { pdfText } from "@/server/pdf";
import { creditNoteNumber, invoiceNumber } from "./billing";

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString("en-US")}`;

/** A one-page credit note for a refund: references the original invoice, the amount credited and the reason. */
export async function renderCreditNotePdf(refund: Refund, inv: Pick<Invoice, "number" | "issuedAt" | "currency" | "amount">, t: Pick<Tenant, "name" | "slug" | "ownerEmail" | "ownerName">): Promise<Buffer> {
  const brand = process.env.PLATFORM_NAME || "Velocity";
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: pdfText(`${creditNoteNumber(refund.number)} — ${t.name}`), Author: brand } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.rect(0, 0, doc.page.width, 84).fill("#150f0d");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(pdfText(brand), 48, 30);
  doc.font("Helvetica").fontSize(10).fillColor("#ffb9d4").text("Credit note", 48, 58);
  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(20).text(creditNoteNumber(refund.number), 48, 108);
  doc.font("Helvetica").fontSize(10).fillColor("#6f645c").text(`Issued ${refund.at.toISOString().slice(0, 10)} · against ${invoiceNumber(inv.number)} of ${inv.issuedAt.toISOString().slice(0, 10)}`, 48, 134);

  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(10).text("Credited to", 48, 168);
  doc.font("Helvetica").fontSize(11).text(pdfText(t.name), 48, 184).fillColor("#6f645c").fontSize(10).text(pdfText(`${t.ownerName ?? ""} ${t.ownerEmail ? `<${t.ownerEmail}>` : ""}`.trim()), 48, 200).text(`Workspace code: ${t.slug}`, 48, 214);

  const y0 = 262;
  doc.rect(48, y0, doc.page.width - 96, 24).fill("#f2ede8");
  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(10).text("Description", 58, y0 + 7).text("Amount", 0, y0 + 7, { align: "right", width: doc.page.width - 58 });
  let y = y0 + 38;
  doc.fillColor("#1a1411").font("Helvetica").fontSize(10.5).text(pdfText(`Refund on ${invoiceNumber(inv.number)}: ${refund.reason}`), 58, y, { width: 360 }).text(`-${fmt(refund.amount, refund.currency)}`, 0, y, { align: "right", width: doc.page.width - 58 });
  y += 40;
  doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor("#e4dcd5").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(13).text("Total credited", 58, y).text(fmt(refund.amount, refund.currency), 0, y, { align: "right", width: doc.page.width - 58 });
  y += 34;
  doc.font("Helvetica").fontSize(10).fillColor("#6f645c").text(`Original invoice total: ${fmt(inv.amount, inv.currency)}${refund.method ? ` · Sent back via ${pdfText(refund.method)}` : ""}${refund.reference ? ` · Reference: ${pdfText(refund.reference)}` : ""}`, 58, y, { width: 460 });
  doc.fontSize(9).fillColor("#988c83").text("Amounts are treated as tax-inclusive. This document was generated automatically.", 48, doc.page.height - 70, { width: doc.page.width - 96, align: "center" });
  doc.end();
  return done;
}
