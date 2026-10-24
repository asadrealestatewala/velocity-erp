import "server-only";
import PDFDocument from "pdfkit";
import type { Invoice, Refund, Tenant } from "@/generated/platform";
import { pdfText } from "@/server/pdf";
import { invoiceNumber, METHOD_LABEL } from "./billing";

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString("en-US")}`;

/** A simple, branded subscription invoice (one page). Taxes are not split out: prices are treated as tax-inclusive. */
export async function renderInvoicePdf(inv: Invoice & { refunds?: Refund[] }, t: Pick<Tenant, "name" | "slug" | "ownerEmail" | "ownerName">): Promise<Buffer> {
  const brand = process.env.PLATFORM_NAME || "YADEA CRM";
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: pdfText(`${invoiceNumber(inv.number)} — ${t.name}`), Author: brand } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  doc.rect(0, 0, doc.page.width, 84).fill("#150f0d");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(pdfText(brand), 48, 30);
  doc.font("Helvetica").fontSize(10).fillColor("#ffb9d4").text("Subscription invoice", 48, 58);
  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(20).text(invoiceNumber(inv.number), 48, 108);
  doc.font("Helvetica").fontSize(10).fillColor("#6f645c").text(`Issued ${inv.issuedAt.toISOString().slice(0, 10)}${inv.paidAt ? ` · Paid ${inv.paidAt.toISOString().slice(0, 10)}` : ""}`, 48, 134);

  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(10).text("Billed to", 48, 168);
  doc.font("Helvetica").fontSize(11).text(pdfText(t.name), 48, 184).fillColor("#6f645c").fontSize(10).text(pdfText(`${t.ownerName ?? ""} ${t.ownerEmail ? `<${t.ownerEmail}>` : ""}`.trim()), 48, 200).text(`Workspace code: ${t.slug}`, 48, 214);

  const y0 = 262;
  doc.rect(48, y0, doc.page.width - 96, 24).fill("#f2ede8");
  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(10).text("Description", 58, y0 + 7).text("Amount", 0, y0 + 7, { align: "right", width: doc.page.width - 58 });
  let y = y0 + 38;
  const row = (label: string, amount: string, muted = false) => {
    doc.fillColor(muted ? "#6f645c" : "#1a1411").font("Helvetica").fontSize(10.5).text(pdfText(label), 58, y, { width: 360 }).text(amount, 0, y, { align: "right", width: doc.page.width - 58 });
    y += 22;
  };
  const planLabel = `${inv.planKey.charAt(0).toUpperCase()}${inv.planKey.slice(1)} plan — ${inv.interval === "YEAR" ? "yearly" : "monthly"} (${inv.periodStart.toISOString().slice(0, 10)} to ${inv.periodEnd.toISOString().slice(0, 10)})`;
  const planPart = inv.amount - inv.setupFee;
  row(planLabel, fmt(planPart + 0, inv.currency));
  if (inv.setupFee > 0) row("One-time setup fee", fmt(inv.setupFee, inv.currency));
  if (inv.couponCode) row(`Coupon ${inv.couponCode} (already reflected in the total)`, "", true);
  doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor("#e4dcd5").stroke();
  y += 10;
  doc.fillColor("#1a1411").font("Helvetica-Bold").fontSize(13).text("Total paid", 58, y).text(fmt(inv.amount, inv.currency), 0, y, { align: "right", width: doc.page.width - 58 });
  y += 34;
  doc.font("Helvetica").fontSize(10).fillColor("#6f645c").text(`Payment method: ${METHOD_LABEL[inv.method]}${inv.reference ? ` · Reference: ${pdfText(inv.reference)}` : ""}`, 58, y);
  const refunded = (inv.refunds ?? []).reduce((a, r) => a + r.amount, 0);
  if (refunded > 0) {
    y += 22;
    doc.fillColor("#b02a2a").text(`Refunded: ${fmt(refunded, inv.currency)} (recorded separately; this invoice shows the amount originally collected).`, 58, y, { width: 460 });
  }
  doc.fontSize(9).fillColor("#988c83").text("Prices are treated as tax-inclusive. This document was generated automatically.", 48, doc.page.height - 70, { width: doc.page.width - 96, align: "center" });
  doc.end();
  return done;
}
