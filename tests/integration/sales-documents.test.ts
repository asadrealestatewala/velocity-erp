import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.4", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { addStockItemAction } from "@/server/actions/inventory";
import { cancelSalesOrderAction, confirmSalesOrderAction, createSalesOrderAction } from "@/server/actions/sales-orders";
import { convertQuotationAction, createQuotationAction, updateQuotationStatusAction } from "@/server/actions/quotations";
import { issueInvoiceAction, markInvoicePaidAction, updateDealershipTaxAction, voidInvoiceAction } from "@/server/actions/invoices";
import { approveReturnAction, rejectReturnAction, requestReturnAction } from "@/server/actions/returns";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
const as = async (id: string) => { session.current = await asUser(id); };
function ok<T extends { ok: boolean }>(r: T) {
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
}
const stock = async () => (await db.inventoryItem.findFirstOrThrow({ where: { dealershipId: w.A.id, bikeModelId: w.m1.id } })).quantity;
const line = (quantity = 1, unitPrice = 100000) => ({ itemKey: `B:${w.m1.id}`, quantity, unitPrice });

beforeEach(async () => {
  w = await buildWorld();
  await as(w.aManager.id);
  ok(await addStockItemAction(w.A.id, { itemKey: `B:${w.m1.id}`, quantity: 5, reorderLevel: 0 }));
});

async function confirmedOrder(qty = 2, discount = 0) {
  ok(await createSalesOrderAction(w.A.id, { customerName: "Ali Raza", lines: [line(qty)], discount, confirmNow: true }));
  return db.salesOrder.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
}

describe("quotations", () => {
  it("converts to a draft order with the same lines, once, without touching stock", async () => {
    await as(w.aRep.id);
    const created = ok(await createQuotationAction(w.A.id, { customerName: "Sana Malik", discount: 5000, lines: [line(2, 90000)], markSent: true }));
    const q = await db.quotation.findUniqueOrThrow({ where: { id: (created.data as { id: string }).id }, include: { lines: true } });
    expect(q).toMatchObject({ status: "SENT", subtotal: expect.anything() });
    expect(Number(q.total)).toBe(175000);

    ok(await updateQuotationStatusAction(q.id, "ACCEPTED"));
    const conv = ok(await convertQuotationAction(q.id));
    const order = await db.salesOrder.findUniqueOrThrow({ where: { id: (conv.data as { id: string }).id }, include: { lines: true } });
    expect(order).toMatchObject({ status: "DRAFT", dealershipId: w.A.id, customerName: "Sana Malik" });
    expect(Number(order.total)).toBe(175000);
    expect(order.lines).toHaveLength(1);
    expect(await stock()).toBe(5);
    expect(await db.quotation.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "CONVERTED", convertedOrderId: order.id });

    expect(await convertQuotationAction(q.id)).toMatchObject({ ok: false });
    expect(await db.salesOrder.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "quotation.converted", dealershipId: w.A.id } })).toBe(1);
  });

  it("refuses expired and rejected quotations, and other dealerships' ones", async () => {
    await as(w.aRep.id);
    const a = ok(await createQuotationAction(w.A.id, { customerName: "Expired Co", lines: [line()], validUntil: new Date(Date.now() - 86_400_000) }));
    expect(await convertQuotationAction((a.data as { id: string }).id)).toMatchObject({ ok: false });
    const b = ok(await createQuotationAction(w.A.id, { customerName: "Rejected Co", lines: [line()] }));
    const bid = (b.data as { id: string }).id;
    ok(await updateQuotationStatusAction(bid, "REJECTED", "too dear"));
    expect(await convertQuotationAction(bid)).toMatchObject({ ok: false });
    expect(await createQuotationAction(w.B.id, { customerName: "X", lines: [line()] })).toMatchObject({ ok: false });
    await as(w.bManager.id);
    expect(await updateQuotationStatusAction(bid, "SENT")).toMatchObject({ ok: false });
  });
});

describe("invoices", () => {
  it("snapshots seller/buyer tax identity and computes tax on the discounted total", async () => {
    await as(w.aManager.id);
    ok(await updateDealershipTaxAction(w.A.id, { ntn: "12345678", strn: "32-77-8801-123-19" }));
    expect(await db.dealership.findUniqueOrThrow({ where: { id: w.A.id } })).toMatchObject({ ntn: "1234567-8" });
    const order = await confirmedOrder(2, 20000); // 200,000 − 20,000
    const r = ok(await issueInvoiceAction({ orderId: order.id, taxRate: 18, buyerNtn: "7654321-0", buyerCnic: "3520212345671" }));
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: (r.data as { id: string }).id }, include: { lines: true } });
    expect(inv).toMatchObject({ sellerNtn: "1234567-8", sellerStrn: "32-77-8801-123-19", buyerNtn: "7654321-0", buyerCnic: "35202-1234567-1", buyerName: "Ali Raza", status: "ISSUED" });
    expect(Number(inv.taxAmount)).toBe(32400);
    expect(Number(inv.total)).toBe(212400);
    expect(inv.lines).toHaveLength(1);

    // later changes to the dealership don't rewrite history
    ok(await updateDealershipTaxAction(w.A.id, { ntn: "1111111-1" }));
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).sellerNtn).toBe("1234567-8");
  });

  it("rejects bad NTNs, drafts, duplicates and other dealerships", async () => {
    await as(w.aRep.id);
    ok(await createSalesOrderAction(w.A.id, { customerName: "Draft Dan", lines: [line()] }));
    const draft = await db.salesOrder.findFirstOrThrow();
    expect(await issueInvoiceAction({ orderId: draft.id, taxRate: 0 })).toMatchObject({ ok: false });
    ok(await confirmSalesOrderAction(draft.id));
    expect(await issueInvoiceAction({ orderId: draft.id, taxRate: 0, buyerNtn: "12-3" })).toMatchObject({ ok: false });
    ok(await issueInvoiceAction({ orderId: draft.id, taxRate: 0 }));
    expect(await issueInvoiceAction({ orderId: draft.id, taxRate: 0 })).toMatchObject({ ok: false });
    expect(await db.invoice.count()).toBe(1);
    await as(w.bManager.id);
    expect(await issueInvoiceAction({ orderId: draft.id, taxRate: 0 })).toMatchObject({ ok: false });
  });

  it("blocks cancelling an invoiced order until the invoice is voided, then allows a new invoice", async () => {
    await as(w.aRep.id);
    const order = await confirmedOrder(1);
    const r = ok(await issueInvoiceAction({ orderId: order.id, taxRate: 0 }));
    const id = (r.data as { id: string }).id;
    expect(await cancelSalesOrderAction(order.id)).toMatchObject({ ok: false });
    ok(await markInvoicePaidAction(id, "Cash"));
    ok(await voidInvoiceAction(id, "wrong buyer"));
    ok(await issueInvoiceAction({ orderId: order.id, taxRate: 0 }));
    expect(await db.invoice.count({ where: { status: { not: "VOID" } } })).toBe(1);
    expect(await markInvoicePaidAction(id, "Cash")).toMatchObject({ ok: false });
  });
});

describe("returns and refunds", () => {
  async function invoiced(qty = 2) {
    const order = await confirmedOrder(qty, 20000);
    const r = ok(await issueInvoiceAction({ orderId: order.id, taxRate: 18 }));
    return db.invoice.findUniqueOrThrow({ where: { id: (r.data as { id: string }).id }, include: { lines: true } });
  }

  it("needs approval, then restocks and refunds the line's share of discount and tax", async () => {
    await as(w.aRep.id);
    const inv = await invoiced(2); // total 212,400 for 2 units
    expect(await stock()).toBe(3);
    const r = ok(await requestReturnAction({ invoiceId: inv.id, reason: "Defective throttle", restock: true, lines: [{ invoiceLineId: inv.lines[0]!.id, quantity: 1 }] }));
    const ret = await db.salesReturn.findUniqueOrThrow({ where: { id: (r.data as { id: string }).id } });
    expect(ret.status).toBe("PENDING");
    expect(Number(ret.refundAmount)).toBe(106200);
    expect(await stock()).toBe(3); // nothing moves until approved

    // a rep can't approve
    expect(await approveReturnAction(ret.id, "CASH")).toMatchObject({ ok: false });
    await as(w.aManager.id);
    ok(await approveReturnAction(ret.id, "BANK_TRANSFER"));
    expect(await stock()).toBe(4);
    expect(await db.salesReturn.findUniqueOrThrow({ where: { id: ret.id } })).toMatchObject({ status: "COMPLETED", refundMethod: "BANK_TRANSFER", processedById: w.aManager.id });
    expect(await db.inventoryMovement.count({ where: { refType: "SalesReturn", refId: ret.id, reason: "RETURN", delta: 1 } })).toBe(1);
    expect(await approveReturnAction(ret.id, "CASH")).toMatchObject({ ok: false });
    expect(await stock()).toBe(4);
    expect(await db.auditLog.count({ where: { action: { in: ["return.requested", "return.approved"] }, dealershipId: w.A.id } })).toBe(2);
  });

  it("cannot return more than was invoiced, counting pending returns; rejection frees the quantity", async () => {
    await as(w.aRep.id);
    const inv = await invoiced(2);
    const lineId = inv.lines[0]!.id;
    const first = ok(await requestReturnAction({ invoiceId: inv.id, reason: "Changed mind", restock: true, lines: [{ invoiceLineId: lineId, quantity: 2 }] }));
    expect(await requestReturnAction({ invoiceId: inv.id, reason: "Again", restock: true, lines: [{ invoiceLineId: lineId, quantity: 1 }] })).toMatchObject({ ok: false });
    expect(await requestReturnAction({ invoiceId: inv.id, reason: "Nothing chosen", restock: true, lines: [{ invoiceLineId: lineId, quantity: 0 }] })).toMatchObject({ ok: false });
    await as(w.aManager.id);
    ok(await rejectReturnAction((first.data as { id: string }).id, "Not eligible"));
    expect(await stock()).toBe(3);
    await as(w.aRep.id);
    ok(await requestReturnAction({ invoiceId: inv.id, reason: "Retry", restock: false, lines: [{ invoiceLineId: lineId, quantity: 2 }] }));
  });

  it("does not restock damaged goods, blocks voiding after a return, and stays inside the dealership", async () => {
    await as(w.aRep.id);
    const inv = await invoiced(1);
    const r = ok(await requestReturnAction({ invoiceId: inv.id, reason: "Crash damage", restock: false, lines: [{ invoiceLineId: inv.lines[0]!.id, quantity: 1 }] }));
    expect(await voidInvoiceAction(inv.id)).toMatchObject({ ok: false });
    await as(w.bManager.id);
    expect(await approveReturnAction((r.data as { id: string }).id, "CASH")).toMatchObject({ ok: false });
    expect(await requestReturnAction({ invoiceId: inv.id, reason: "Not mine", restock: true, lines: [] })).toMatchObject({ ok: false });
    await as(w.aManager.id);
    ok(await approveReturnAction((r.data as { id: string }).id, "CASH"));
    expect(await stock()).toBe(4); // 5 − 1 sold; damaged unit not returned to stock
  });
});

describe("PDFs", () => {
  it("renders invoice, quotation and return PDFs for the own dealership only", async () => {
    const { GET: invoicePdf } = await import("@/app/api/invoices/[id]/pdf/route");
    const { GET: quotationPdf } = await import("@/app/api/quotations/[id]/pdf/route");
    const { GET: returnPdf } = await import("@/app/api/returns/[id]/pdf/route");
    await as(w.aManager.id);
    const order = await confirmedOrder(1);
    const inv = ok(await issueInvoiceAction({ orderId: order.id, taxRate: 18, buyerNtn: "1234567-8" }));
    const invId = (inv.data as { id: string }).id;
    const line = (await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: invId } })).id;
    const ret = ok(await requestReturnAction({ invoiceId: invId, reason: "Wrong colour", restock: true, lines: [{ invoiceLineId: line, quantity: 1 }] }));
    const qt = ok(await createQuotationAction(w.A.id, { customerName: "Q Customer", lines: [line0()] }));
    const call = async (fn: typeof invoicePdf, id: string) => fn(new Request("http://x") as never, { params: Promise.resolve({ id }) });

    for (const [fn, id] of [[invoicePdf, invId], [quotationPdf, (qt.data as { id: string }).id], [returnPdf, (ret.data as { id: string }).id]] as const) {
      const res = await call(fn, id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    }
    await as(w.bManager.id);
    expect((await call(invoicePdf, invId)).status).toBe(404);
    expect((await call(returnPdf, (ret.data as { id: string }).id)).status).toBe(404);
  });
});

function line0() { return { itemKey: `B:${w.m1.id}`, quantity: 1, unitPrice: 100000 }; }
