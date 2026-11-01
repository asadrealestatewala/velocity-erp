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

// ── After-sales service

const serviceVehicle = {
  vehicleLabel: optStr(120),
  plateNumber: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v), z.string().max(20).nullable().optional()),
  chassisNo: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v), z.string().max(40).nullable().optional()),
};
const serviceCustomer = {
  contactId: optId,
  customerName: optStr(120),
  customerPhone: optStr(30),
};
const needCustomer = (v: { contactId?: string | null; customerName?: string | null }) => !!v.contactId || (!!v.customerName && v.customerName.length >= 2);
const needCustomerMsg = { path: ["customerName"], message: "Choose a contact or enter the customer's name" };

export const serviceBookingSchema = z
  .object({
    ...serviceCustomer,
    ...serviceVehicle,
    serviceType: z.string().trim().min(2, "Choose the type of service").max(60),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
    assignedUserId: optId,
    notes: optStr(1000),
    confirmNow: z.boolean().default(false),
  })
  .refine(needCustomer, needCustomerMsg);
export type ServiceBookingInput = z.input<typeof serviceBookingSchema>;

export const jobCardSchema = z
  .object({
    ...serviceCustomer,
    ...serviceVehicle,
    odometerKm: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(2_000_000).nullable().optional()),
    complaint: z.string().trim().min(3, "Describe the complaint or work requested").max(2000),
    isWarranty: z.boolean().default(false),
    technicianId: optId,
  })
  .refine(needCustomer, needCustomerMsg);
export type JobCardInput = z.input<typeof jobCardSchema>;

export const jobCardUpdateSchema = z.object({
  diagnosis: optStr(2000),
  workDone: optStr(2000),
  odometerKm: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(2_000_000).nullable().optional()),
  labourCharge: money.default(0),
  discount: money.default(0),
  isWarranty: z.boolean().default(false),
  technicianId: optId,
});
export type JobCardUpdateInput = z.input<typeof jobCardUpdateSchema>;

export const jobCardPartSchema = z.object({ productId: z.string().min(1, "Choose a spare part"), quantity: qty, unitPrice: money.optional() });

export const warrantyClaimSchema = z.object({
  jobCardId: z.string().min(1),
  jobCardPartId: optId,
  failureDescription: z.string().trim().min(5, "Describe the failure").max(2000),
  claimAmount: money.optional(),
});
export type WarrantyClaimInput = z.input<typeof warrantyClaimSchema>;

export const warrantyReviewSchema = z
  .object({
    claimId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    approvedAmount: money.optional(),
    note: optStr(1000),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.note && v.note.length >= 3), { path: ["note"], message: "Give a reason for rejecting the claim" });

export { phoneSchema };
