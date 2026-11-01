import { z } from "zod";
import { orderLineSchema } from "@/lib/validation-ops";
import { normalizeCnic, normalizeNtn } from "@/lib/sales-math";

const optStr = (max = 200) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable().optional());
const optId = z.preprocess((v) => (v === "" ? null : v), z.string().min(1).max(40).nullable().optional());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable().optional());
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative").max(1_000_000_000, "Amount is too large");

const ntn = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().nullable().optional().refine((v) => !v || normalizeNtn(v) !== null, "NTN looks like 1234567-8").transform((v) => (v ? normalizeNtn(v) : null)),
);
const cnic = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().nullable().optional().refine((v) => !v || normalizeCnic(v) !== null, "CNIC looks like 35202-1234567-1").transform((v) => (v ? normalizeCnic(v) : null)),
);

export const quotationSchema = z
  .object({
    contactId: optId,
    leadId: optId,
    customerName: optStr(120),
    notes: optStr(1000),
    discount: money.default(0),
    validUntil: optDate,
    lines: z.array(orderLineSchema).min(1, "Add at least one item").max(30, "Too many lines"),
    markSent: z.boolean().default(false),
  })
  .refine((v) => v.contactId || (v.customerName && v.customerName.length >= 2), { path: ["customerName"], message: "Choose a contact or enter the customer's name" });

export const issueInvoiceSchema = z.object({
  orderId: z.string().min(1),
  buyerNtn: ntn,
  buyerCnic: cnic,
  buyerAddress: optStr(300),
  taxRate: z.coerce.number({ message: "Enter a rate" }).min(0, "Cannot be negative").max(100, "At most 100%").default(0),
  dueDate: optDate,
  notes: optStr(1000),
});

export const dealershipTaxSchema = z.object({ ntn, strn: optStr(30) });

export const returnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why the items are coming back").max(500),
  restock: z.boolean().default(true),
  lines: z.array(z.object({ invoiceLineId: z.string().min(1), quantity: z.coerce.number().int().min(0).max(100_000) })).max(30),
});

export const REFUND_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "MOBILE_WALLET", "STORE_CREDIT"] as const;
export const approveReturnSchema = z.object({ returnId: z.string().min(1), refundMethod: z.enum(REFUND_METHODS) });
