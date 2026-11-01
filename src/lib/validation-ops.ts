import { z } from "zod";
import { phoneSchema } from "@/lib/validation";

// Input schemas for the operations modules. Money/quantity fields coerce form strings to numbers.

const optStr = (max = 200) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable().optional());
const optId = z.preprocess((v) => (v === "" ? null : v), z.string().min(1).max(40).nullable().optional());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable().optional());
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative").max(1_000_000_000, "Amount is too large");
const positiveMoney = z.coerce.number({ message: "Enter an amount" }).positive("Must be greater than 0").max(1_000_000_000, "Amount is too large");
const qty = z.coerce.number({ message: "Enter a quantity" }).int("Whole numbers only").min(1, "At least 1").max(100_000);
const itemKey = z.string().regex(/^[BP]:.{1,40}$/, "Choose an item");
const currency = z.string().trim().length(3).default("PKR");

export const stockAddSchema = z.object({
  itemKey,
  quantity: z.coerce.number().int().min(0, "Cannot be negative").max(1_000_000),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0),
  note: optStr(300),
});

export const stockAdjustSchema = z
  .object({
    itemId: z.string().min(1),
    mode: z.enum(["ADD", "REMOVE", "SET"]),
    quantity: z.coerce.number({ message: "Enter a quantity" }).int("Whole numbers only").min(0).max(1_000_000),
    reason: z.enum(["ADJUSTMENT", "RETURN", "DAMAGE", "OPENING_STOCK"]).default("ADJUSTMENT"),
    note: optStr(300),
  })
  .refine((v) => v.mode === "SET" || v.quantity > 0, { path: ["quantity"], message: "At least 1" });

export const reorderLevelSchema = z.object({ itemId: z.string().min(1), reorderLevel: z.coerce.number().int().min(0).max(1_000_000) });

export const orderLineSchema = z.object({ itemKey, quantity: qty, unitPrice: money });
export const salesOrderSchema = z
  .object({
    contactId: optId,
    leadId: optId,
    customerName: optStr(120),
    notes: optStr(1000),
    discount: money.default(0),
    lines: z.array(orderLineSchema).min(1, "Add at least one item").max(30, "Too many lines"),
    confirmNow: z.boolean().default(false),
  })
  .refine((v) => v.contactId || (v.customerName && v.customerName.length >= 2), { path: ["customerName"], message: "Choose a contact or enter the customer's name" });
export type SalesOrderInput = z.input<typeof salesOrderSchema>;

export const stockOrderLineSchema = z.object({ itemKey, quantity: qty });
export const stockOrderSchema = z.object({
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  dealerNotes: optStr(1000),
  lines: z.array(stockOrderLineSchema).min(1, "Add at least one item").max(60, "Too many lines"),
});
export type StockOrderInput = z.input<typeof stockOrderSchema>;

export const productSchema = z.object({
  sku: z.string().trim().min(2, "At least 2 characters").max(40).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes"),
  name: z.string().trim().min(2).max(160),
  category: optStr(60),
  description: optStr(2000),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  price: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().max(1_000_000_000).nullable()),
  dealerPrice: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().max(1_000_000_000).nullable()),
  currency,
  isActive: z.boolean().default(true),
});
export type ProductInput = z.input<typeof productSchema>;

/** Procurement approving an order: each line may be priced; expected delivery is optional at this stage. */
export const approveOrderSchema = z.object({
  orderId: z.string().min(1),
  prices: z.record(z.string(), money).default({}),
  expectedDeliveryDate: optDate,
  internalNotes: optStr(1000),
});

export const dispatchUpdateSchema = z.object({
  orderId: z.string().min(1),
  dispatchStatus: z.enum(["PACKING", "DISPATCHED", "IN_TRANSIT", "DELIVERED"]),
  expectedDeliveryDate: optDate,
  courier: optStr(80),
  trackingNumber: optStr(80),
  note: optStr(500),
});

export const receiptSchema = z.object({
  orderId: z.string().min(1),
  /** Quantity received per order line id (defaults to the full ordered quantity). */
  received: z.record(z.string(), z.coerce.number().int().min(0).max(100_000)).default({}),
});

export const dealerPaymentSchema = z.object({
  amount: positiveMoney,
  currency,
  entryDate: z.coerce.date({ message: "Choose a date" }),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "MOBILE_WALLET", "OTHER"]),
  reference: optStr(120),
  description: optStr(300),
  orderId: optId,
});

export const ledgerAdjustSchema = z.object({
  dealershipId: z.string().min(1),
  type: z.enum(["INVOICE", "CREDIT_NOTE", "ADJUSTMENT", "PAYMENT"]),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount: positiveMoney,
  currency,
  entryDate: z.coerce.date(),
  reference: optStr(120),
  description: z.string().trim().min(3, "Describe the entry").max(300),
  orderId: optId,
});

export const voucherSchema = z.object({
  kind: z.enum(["EXPENSE", "PAYMENT_TO_YADEA"]).default("EXPENSE"),
  voucherDate: z.coerce.date({ message: "Choose a date" }),
  category: z.string().trim().min(2, "Choose a category").max(60),
  payee: optStr(120),
  description: optStr(500),
  amount: positiveMoney,
  taxAmount: money.default(0),
  currency,
  method: z.preprocess((v) => (v === "" ? null : v), z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "MOBILE_WALLET", "OTHER"]).nullable().optional()),
  reference: optStr(120),
});
export type VoucherInput = z.input<typeof voucherSchema>;

export const dealerDocSchema = z.object({
  category: z.enum(["REGISTRATION_CERTIFICATE", "BUSINESS_LICENSE", "TAX_REGISTRATION", "AGREEMENT", "ACHIEVEMENT_CERTIFICATE", "OTHER"]),
  title: z.string().trim().min(2, "Give the document a title").max(160),
  description: optStr(500),
  expiresAt: optDate,
});

export const messageSchema = z.object({
  contactId: z.string().min(1),
  leadId: optId,
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  body: z.string().trim().min(1, "Write a message").max(4000),
  subject: optStr(200),
});

export const loggedMessageSchema = messageSchema.extend({
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  occurredAt: optDate,
});

export const knowledgeSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10, "Write at least a sentence").max(8000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  isActive: z.boolean().default(true),
});
export type KnowledgeInput = z.input<typeof knowledgeSchema>;

export { phoneSchema };

// ── Vehicle units (chassis / engine / number plate)
export const normalizeChassis = (v: string) => v.toUpperCase().replace(/\s+/g, "");
export const normalizePlate = (v: string) => v.toUpperCase().replace(/\s+/g, " ").trim();
const chassis = z
  .string({ message: "Enter the chassis number" })
  .transform(normalizeChassis)
  .pipe(z.string().regex(/^[A-Z0-9-]{5,30}$/, "Letters, digits and dashes only (5–30 characters)"));
const plate = z.string().transform(normalizePlate).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9 -]{1,14}$/, "Enter a valid number plate"));

export const vehicleAddSchema = z.object({
  bikeModelId: z.string().min(1, "Choose a model"),
  chassisNumber: chassis,
  engineNumber: optStr(40),
  color: optStr(40),
  note: optStr(300),
});

export const vehicleAssignSchema = z.object({ vehicleId: z.string().min(1), salesOrderId: z.string().min(1) });

export const vehicleRegistrationSchema = z
  .object({
    vehicleId: z.string().min(1),
    registrationStatus: z.enum(["NOT_REGISTERED", "APPLIED", "REGISTERED"]),
    plateNumber: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), plate.nullable().optional()),
    registeredAt: optDate,
  })
  .refine((v) => v.registrationStatus !== "REGISTERED" || !!v.plateNumber, { path: ["plateNumber"], message: "Enter the number plate" });
