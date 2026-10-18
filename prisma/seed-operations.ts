/**
 * Operations demo data — FICTIONAL DEMONSTRATION DATA ONLY.
 *
 * Adds, on top of the core demo data: the Procurement user, dealer mobile numbers, the GT70 / Ruibin L / Ruibin S /
 * Keeness bike models (names only — no specifications or prices), example spare parts, showroom stock, stock orders at
 * every stage, a dealer ledger with a payment awaiting verification, expense vouchers with receipts, dealership
 * documents and a logged WhatsApp conversation.
 *
 * Amounts in the demo orders, invoices and payments are round numbers that exist only to make the demo readable — they
 * are NOT YADEA prices. Catalogue prices stay empty until an administrator enters them.
 *
 * Safe to run more than once: the structural parts are upserts and the demo transactions run only once (marker row).
 * Run:  npm run db:seed:operations   (refuses to run when NODE_ENV=production unless ALLOW_PROD_SEED=1)
 */
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "../src/lib/demo";
import { syncPermissionCatalog } from "../src/server/permission-sync";
import { normalizePhone } from "../src/lib/utils";
import { adjustStock, type ItemRef } from "../src/server/services/inventory";
import { approveOrder, confirmReceipt, rejectOrder, submitStockOrder, updateDispatch } from "../src/server/services/procurement";
import { ledgerDay, postManualEntry, recordDealerPayment, verifyPayment } from "../src/server/services/ledger";
import { confirmSalesOrder, createSalesOrder } from "../src/server/services/sales-orders";
import { logMessage } from "../src/server/services/messages";
import { putUpload } from "../src/server/storage";
import { renderPdf } from "../src/server/pdf";

const MARKER = "seed:operations:v1";
const D = (n: number) => new Date(Date.now() + n * 86400_000);

async function demoPdf(title: string, lines: string[]) {
  const buf = await renderPdf({ title, subtitle: "Demo document — fictional" }, (doc) => {
    doc.font("Helvetica").fontSize(11).fillColor("#0f172a");
    for (const l of lines) doc.text(l).moveDown(0.4);
  });
  return new File([new Uint8Array(buf)], `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, { type: "application/pdf" });
}

async function storeFile(file: File, uploadedById: string, folder: string) {
  return db.storedFile.create({ data: await putUpload(file, { kind: "document", uploadedById, folder }) });
}

export async function seedOperations() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") throw new Error("Refusing to seed demo data in production.");
  console.log("Seeding operations demo data…");

  // ── Permissions and roles (adds the Procurement role, the new permissions, and the one-time default-grant upgrades)
  const sync = await syncPermissionCatalog();
  console.log(`  permissions synced: ${JSON.stringify(sync)}`);

  const procRole = await db.role.findUniqueOrThrow({ where: { key: "PROCUREMENT" } });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const proc = await db.user.upsert({
    where: { email: `procurement@${DEMO_EMAIL_DOMAIN}` },
    create: { email: `procurement@${DEMO_EMAIL_DOMAIN}`, name: "Pervez Procurement (Demo)", phone: "0300 0000201", phoneNormalized: normalizePhone("0300 0000201"), passwordHash: hash, roleId: procRole.id },
    update: {},
  });

  // ── Mobile numbers for the demo dealership users (so they can sign in with a number too)
  const phones: Record<string, string> = {
    "manager.gulberg": "0300 0000111", "rep1.gulberg": "0300 0000112", "rep2.gulberg": "0300 0000113",
    "manager.dha": "0300 0000121", "rep1.dha": "0300 0000122",
    "manager.clifton": "0300 0000131", "rep1.clifton": "0300 0000132", "rep2.clifton": "0300 0000133",
    "manager.bluearea": "0300 0000141", "rep1.bluearea": "0300 0000142",
  };
  for (const [local, phone] of Object.entries(phones)) {
    const u = await db.user.findUnique({ where: { email: `${local}@${DEMO_EMAIL_DOMAIN}` } });
    if (u && !u.phoneNormalized) await db.user.update({ where: { id: u.id }, data: { phone, phoneNormalized: normalizePhone(phone) } });
  }

  // ── Bike models named by the business (names only: no specifications, no prices)
  const modelDefs = [
    { name: "GT70", code: "GT70", displayOrder: 20 },
    { name: "Ruibin L", code: "RUIBIN-L", displayOrder: 21 },
    { name: "Ruibin S", code: "RUIBIN-S", displayOrder: 22 },
    { name: "Keeness", code: "KEENESS", displayOrder: 23 },
  ];
  const models: Record<string, { id: string }> = {};
  for (const m of modelDefs) {
    models[m.code] = await db.bikeModel.upsert({
      where: { code: m.code },
      create: { ...m, category: "E-Moped", description: "Model name added from the business catalogue. Specifications and prices to be entered by an administrator.", specifications: { note: "Specifications to be entered by an administrator" } },
      update: {},
    });
  }
  const dealerCodes = ["LHR-01", "LHR-02", "KHI-01", "ISB-01"];
  const dealers = await db.dealership.findMany({ where: { code: { in: dealerCodes } } });
  for (const d of dealers) {
    await db.dealershipBikeModel.createMany({ data: Object.values(models).map((m) => ({ dealershipId: d.id, bikeModelId: m.id })), skipDuplicates: true });
  }

  // ── Spare parts (generic examples — no prices)
  const partDefs = [
    ["BRK-F-01", "Brake pad set — front", "Brakes"], ["BRK-R-01", "Brake pad set — rear", "Brakes"], ["MIR-01", "Rear-view mirror (pair)", "Body"],
    ["CHG-72-01", "Battery charger 72V", "Electrical"], ["TYR-14-01", "Tyre 14 inch", "Tyres"], ["CTL-01", "Motor controller", "Electrical"],
    ["LGT-H-01", "Headlight assembly", "Electrical"], ["MUD-F-01", "Front mudguard", "Body"],
  ] as const;
  const parts: Record<string, { id: string }> = {};
  for (const [sku, name, category] of partDefs) {
    parts[sku] = await db.product.upsert({ where: { sku }, create: { sku, name, category, isSeedExample: true, description: "Seed example part — replace with the official catalogue." }, update: {} });
  }

  if (await db.setting.findUnique({ where: { key: MARKER } })) {
    console.log("  demo transactions already seeded — skipping (structure above was refreshed).");
    return;
  }
  if (dealers.length < 4) {
    console.log("  the core demo dealerships are missing — run `npm run db:seed` first; skipping demo transactions.");
    return;
  }

  const byCode = Object.fromEntries(dealers.map((d) => [d.code, d]));
  const user = async (local: string) => db.user.findUniqueOrThrow({ where: { email: `${local}@${DEMO_EMAIL_DOMAIN}` } });
  const gulbergMgr = await user("manager.gulberg");
  const gulbergRep = await user("rep1.gulberg");
  const dhaMgr = await user("manager.dha");
  const cliftonMgr = await user("manager.clifton");
  const blueMgr = await user("manager.bluearea");
  const bike = (code: string): ItemRef => ({ bikeModelId: models[code]!.id });
  const part = (sku: string): ItemRef => ({ productId: parts[sku]!.id });
  const key = (r: ItemRef) => (r.bikeModelId ? `B:${r.bikeModelId}` : `P:${r.productId}`);

  const stock = async (dealershipId: string, userId: string, rows: [ItemRef, number, number][]) => {
    for (const [ref, qty, reorder] of rows) {
      await db.$transaction(async (tx) => {
        const item = await tx.inventoryItem.upsert({
          where: ref.bikeModelId ? { dealershipId_bikeModelId: { dealershipId, bikeModelId: ref.bikeModelId } } : { dealershipId_productId: { dealershipId, productId: ref.productId! } },
          create: { dealershipId, bikeModelId: ref.bikeModelId ?? null, productId: ref.productId ?? null, reorderLevel: reorder },
          update: { reorderLevel: reorder },
        });
        void item;
        if (qty > 0) await adjustStock(tx, { dealershipId, ref, delta: qty, reason: "OPENING_STOCK", note: "Opening stock (demo)", userId });
      });
    }
  };

  // ── Showroom stock
  const G = byCode["LHR-01"]!, H = byCode["LHR-02"]!, K = byCode["KHI-01"]!, B = byCode["ISB-01"]!;
  await stock(G.id, gulbergMgr.id, [[bike("GT70"), 2, 2], [bike("RUIBIN-L"), 3, 2], [bike("RUIBIN-S"), 1, 2], [bike("KEENESS"), 0, 1], [part("BRK-F-01"), 4, 10], [part("BRK-R-01"), 8, 10], [part("MIR-01"), 40, 10], [part("CHG-72-01"), 2, 3], [part("TYR-14-01"), 12, 6]]);
  await stock(H.id, dhaMgr.id, [[bike("GT70"), 5, 2], [bike("RUIBIN-S"), 2, 2], [part("BRK-F-01"), 18, 8], [part("MIR-01"), 6, 8]]);
  await stock(K.id, cliftonMgr.id, [[bike("GT70"), 1, 2], [bike("RUIBIN-L"), 4, 2], [bike("KEENESS"), 2, 1], [part("CTL-01"), 3, 2], [part("LGT-H-01"), 9, 4]]);
  await stock(B.id, blueMgr.id, [[bike("RUIBIN-L"), 2, 1], [part("BRK-F-01"), 12, 6], [part("MUD-F-01"), 5, 3]]);
  // Empty rows were created for out-of-stock items; make sure at least one item is exactly 0 to show the alert state.

  // ── Gulberg: a delivered + received order, one in transit, one waiting for a decision
  const submit = (dealershipId: string, userId: string, lines: { ref: ItemRef; qty: number }[], priority: "NORMAL" | "URGENT" = "NORMAL", notes?: string) =>
    db.$transaction((tx) => submitStockOrder(tx, { dealershipId, userId, priority, dealerNotes: notes, lines: lines.map((l) => ({ itemKey: key(l.ref), quantity: l.qty })) }));
  const approve = async (orderId: string, prices: Record<string, number>, eta?: Date) => {
    const lines = await db.procurementOrderLine.findMany({ where: { orderId } });
    const byLine: Record<string, number> = {};
    for (const l of lines) byLine[l.id] = prices[l.code ?? ""] ?? 0;
    return db.$transaction((tx) => approveOrder(tx, { orderId, userId: proc.id, prices: byLine, expectedDeliveryDate: eta, internalNotes: "Demo amounts — not real prices" }));
  };
  const dispatch = (orderId: string, status: "PACKING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED", extra: { courier?: string; trackingNumber?: string; eta?: Date } = {}) =>
    db.$transaction((tx) => updateDispatch(tx, { orderId, userId: proc.id, dispatchStatus: status, courier: extra.courier, trackingNumber: extra.trackingNumber, expectedDeliveryDate: extra.eta }));
  const backdate = (orderId: string, days: number) => db.procurementOrder.update({ where: { id: orderId }, data: { submittedAt: D(-days) } });

  const po1 = await submit(G.id, gulbergMgr.id, [{ ref: bike("GT70"), qty: 4 }, { ref: part("BRK-F-01"), qty: 20 }], "NORMAL", "Restock before the weekend rush.");
  await approve(po1.id, { GT70: 180000, "BRK-F-01": 1200 }, D(-12));
  await dispatch(po1.id, "PACKING");
  await dispatch(po1.id, "DISPATCHED", { courier: "TCS", trackingNumber: "TCS-DEMO-1001" });
  await dispatch(po1.id, "DELIVERED");
  await db.$transaction((tx) => confirmReceipt(tx, { orderId: po1.id, dealershipId: G.id, userId: gulbergMgr.id, received: {} }));
  await backdate(po1.id, 21);

  const po2 = await submit(G.id, gulbergMgr.id, [{ ref: bike("RUIBIN-S"), qty: 3 }, { ref: part("CHG-72-01"), qty: 5 }]);
  await approve(po2.id, { "RUIBIN-S": 150000, "CHG-72-01": 9500 }, D(1));
  await dispatch(po2.id, "DISPATCHED", { courier: "Leopards", trackingNumber: "LEO-DEMO-2002" });
  await dispatch(po2.id, "IN_TRANSIT");
  await backdate(po2.id, 6);

  const po3 = await submit(G.id, gulbergMgr.id, [{ ref: part("BRK-R-01"), qty: 30 }, { ref: part("CHG-72-01"), qty: 4 }], "URGENT", "Both are below our reorder level.");
  await backdate(po3.id, 1);

  // ── DHA: approved but late, and a rejected request
  const po4 = await submit(H.id, dhaMgr.id, [{ ref: bike("RUIBIN-S"), qty: 2 }, { ref: part("MIR-01"), qty: 12 }]);
  await approve(po4.id, { "RUIBIN-S": 150000, "MIR-01": 800 }, D(-3));
  await dispatch(po4.id, "PACKING");
  await backdate(po4.id, 9);
  const po5 = await submit(H.id, dhaMgr.id, [{ ref: bike("KEENESS"), qty: 6 }]);
  await db.$transaction((tx) => rejectOrder(tx, { orderId: po5.id, userId: proc.id, reason: "Keeness is not yet available for dealer ordering. Please order again when it is released." }));
  await backdate(po5.id, 4);

  // ── Clifton: urgent order waiting; Blue Area: delivered, receipt not yet confirmed
  const po6 = await submit(K.id, cliftonMgr.id, [{ ref: bike("GT70"), qty: 3 }], "URGENT", "Only one GT70 left in the showroom.");
  await backdate(po6.id, 2);
  const po7 = await submit(B.id, blueMgr.id, [{ ref: part("MUD-F-01"), qty: 10 }, { ref: part("BRK-F-01"), qty: 12 }]);
  await approve(po7.id, { "MUD-F-01": 2200, "BRK-F-01": 1200 }, D(-2));
  await dispatch(po7.id, "DISPATCHED", { courier: "M&P", trackingNumber: "MP-DEMO-3003" });
  await dispatch(po7.id, "DELIVERED");
  await backdate(po7.id, 8);

  // ── Ledger: opening balance for DHA; Gulberg pays PO-1 (verified) and sends a second payment (awaiting verification)
  await db.$transaction((tx) => postManualEntry(tx, { dealershipId: H.id, userId: proc.id, type: "INVOICE", direction: "DEBIT", amount: 250000, currency: "PKR", entryDate: ledgerDay(D(-40)), reference: "OPENING", description: "Opening balance brought forward (demo)" }));
  const payFile = await storeFile(await demoPdf("Bank transfer slip", ["Beneficiary: YADEA (Demo)", "Amount: PKR 500,000", "Reference: PO-1 part payment"]), gulbergMgr.id, "vouchers");
  const payFile2 = await storeFile(await demoPdf("Bank transfer slip 2", ["Beneficiary: YADEA (Demo)", "Amount: PKR 150,000", "Reference: PO-2 advance"]), gulbergMgr.id, "vouchers");
  // Invoices were raised at dispatch (today); date them when each order actually shipped so the statement reads in order.
  for (const [orderId, daysAgo] of [[po1.id, 14], [po2.id, 3], [po7.id, 6]] as const) {
    await db.ledgerEntry.updateMany({ where: { orderId, type: "INVOICE" }, data: { entryDate: ledgerDay(D(-daysAgo)) } });
  }
  const payment = async (amount: number, fileId: string, reference: string, description: string, orderId: string, verified: boolean, daysAgo: number) => {
    await db.$transaction(async (tx) => {
      const v = await tx.expenseVoucher.create({ data: { dealershipId: G.id, kind: "PAYMENT_TO_YADEA", voucherDate: ledgerDay(D(-daysAgo)), category: "Payment to YADEA", payee: "YADEA", description, amount, method: "BANK_TRANSFER", reference, createdById: gulbergMgr.id } });
      await tx.voucherAttachment.create({ data: { voucherId: v.id, fileId, kind: "PROOF_OF_PAYMENT", label: "Bank slip", uploadedById: gulbergMgr.id } });
      const e = await recordDealerPayment(tx, { dealershipId: G.id, userId: gulbergMgr.id, amount, currency: "PKR", entryDate: ledgerDay(D(-daysAgo)), method: "BANK_TRANSFER", reference, description, orderId, voucherId: v.id });
      if (verified) await verifyPayment(tx, e.id, proc.id);
    });
  };
  await payment(500000, payFile.id, "TX-DEMO-7781", "Part payment for PO-1", po1.id, true, 10);
  await payment(150000, payFile2.id, "TX-DEMO-7790", "Advance for PO-2", po2.id, false, 1);

  // ── Expense vouchers with receipts / invoices / proofs
  const voucher = async (v: { category: string; payee: string; amount: number; tax: number; days: number; status: "SUBMITTED" | "APPROVED"; docs: { kind: "INVOICE" | "PROOF_OF_INVOICE" | "PROOF_OF_PAYMENT" | "RECEIPT"; title: string }[] }) => {
    await db.$transaction(async (tx) => {
      const created = await tx.expenseVoucher.create({
        data: { dealershipId: G.id, kind: "EXPENSE", voucherDate: ledgerDay(D(-v.days)), category: v.category, payee: v.payee, amount: v.amount, taxAmount: v.tax, method: "BANK_TRANSFER", reference: `REF-${Math.floor(1000 + v.days * 37)}`, status: v.status, createdById: gulbergMgr.id, ...(v.status === "APPROVED" ? { reviewedById: proc.id, reviewedAt: new Date() } : {}) },
      });
      for (const d of v.docs) {
        const f = await storeFile(await demoPdf(d.title, [`${v.category} — ${v.payee}`, `Amount: PKR ${v.amount.toLocaleString()} (demo)`]), gulbergMgr.id, "vouchers");
        await tx.voucherAttachment.create({ data: { voucherId: created.id, fileId: f.id, kind: d.kind, uploadedById: gulbergMgr.id } });
      }
    });
  };
  await voucher({ category: "Rent & utilities", payee: "Demo Landlord", amount: 118000, tax: 18000, days: 12, status: "APPROVED", docs: [{ kind: "INVOICE", title: "Rent invoice" }, { kind: "PROOF_OF_PAYMENT", title: "Rent payment slip" }] });
  await voucher({ category: "Marketing & advertising", payee: "Demo Print House", amount: 35400, tax: 5400, days: 5, status: "SUBMITTED", docs: [{ kind: "INVOICE", title: "Printing invoice" }, { kind: "PROOF_OF_INVOICE", title: "Delivery challan" }] });
  await voucher({ category: "Showroom maintenance", payee: "Demo Electrician", amount: 8500, tax: 0, days: 2, status: "SUBMITTED", docs: [{ kind: "RECEIPT", title: "Electrician receipt" }] });

  // ── Dealership documents and a certificate
  const reg = await storeFile(await demoPdf("Certificate of registration", ["Gulberg E-Mobility Pvt Ltd (Demo)", "Registration no.: DEMO-0001 (fictional)"]), gulbergMgr.id, "dealer-documents");
  await db.dealershipDocument.create({ data: { dealershipId: G.id, category: "REGISTRATION_CERTIFICATE", title: "Certificate of registration", fileId: reg.id, source: "DEALERSHIP", uploadedById: gulbergMgr.id } });
  const cert = await storeFile(await demoPdf("Top Performing Dealership", ["Awarded to Gulberg E-Mobility (Demo)", "In recognition of outstanding customer service — demo certificate"]), proc.id, "dealer-documents");
  await db.dealershipDocument.create({ data: { dealershipId: G.id, category: "ACHIEVEMENT_CERTIFICATE", title: "Top Performing Dealership — Q3 (demo)", description: "Demo certificate issued by YADEA.", fileId: cert.id, source: "YADEA", uploadedById: proc.id } });
  const blueReg = await storeFile(await demoPdf("Business licence", ["Blue Area Motors (Demo)"]), blueMgr.id, "dealer-documents");
  await db.dealershipDocument.create({ data: { dealershipId: B.id, category: "BUSINESS_LICENSE", title: "Business licence", fileId: blueReg.id, source: "DEALERSHIP", uploadedById: blueMgr.id, expiresAt: D(20) } });

  // ── Customer orders at Gulberg (two confirmed, one draft)
  const leads = await db.lead.findMany({ where: { dealershipId: G.id, isArchived: false }, include: { contact: true }, orderBy: { createdAt: "asc" }, take: 4 });
  const sale = async (leadIdx: number, lines: { ref: ItemRef; qty: number; price: number }[], confirm: boolean) => {
    const l = leads[leadIdx];
    if (!l) return;
    await db.$transaction(async (tx) => {
      const o = await createSalesOrder(tx, { dealershipId: G.id, userId: gulbergRep.id, contactId: l.contactId, leadId: l.id, discount: 0, lines: lines.map((x) => ({ itemKey: key(x.ref), quantity: x.qty, unitPrice: x.price })) });
      if (confirm) await confirmSalesOrder(tx, o.id, gulbergRep.id);
    });
  };
  await sale(0, [{ ref: bike("GT70"), qty: 1, price: 230000 }, { ref: part("MIR-01"), qty: 1, price: 1500 }], true);
  await sale(1, [{ ref: part("TYR-14-01"), qty: 2, price: 6500 }], true);
  await sale(2, [{ ref: bike("RUIBIN-L"), qty: 1, price: 210000 }], false);

  // ── A WhatsApp conversation logged manually on the first Gulberg contact (clearly marked as logged, not sent)
  if (leads[0]) {
    const base = { userId: gulbergRep.id, contactId: leads[0].contactId, leadId: leads[0].id, dealershipId: G.id, channel: "WHATSAPP" as const };
    await logMessage({ ...base, direction: "OUTBOUND", body: "Assalam o Alaikum! Thank you for visiting Gulberg E-Mobility. The GT70 you liked is in stock.", occurredAt: D(-3) });
    await logMessage({ ...base, direction: "INBOUND", body: "Great, can I book it today? What documents do I need?", occurredAt: new Date(D(-3).getTime() + 15 * 60_000) });
    await logMessage({ ...base, direction: "OUTBOUND", body: "Yes — please bring your CNIC. We'll prepare the order.", occurredAt: new Date(D(-3).getTime() + 30 * 60_000) });
  }

  await db.setting.create({ data: { key: MARKER, value: { at: new Date().toISOString() } } });
  console.log("Operations demo data ready.");
  console.log(`  Procurement sign-in: procurement@${DEMO_EMAIL_DOMAIN}  (or mobile 0300 0000201)`);
  console.log("  Dealership managers can also sign in with their mobile number, e.g. 0300 0000111 (Gulberg).");
}
