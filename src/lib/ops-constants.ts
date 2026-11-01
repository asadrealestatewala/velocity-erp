import type { Tone } from "@/components/ui/misc";

// Client-safe labels/tones for the operations modules (inventory, orders, ledger, vouchers, documents).

export type StatusMeta = { label: string; tone: Tone };

export const SALES_ORDER_STATUS: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const PROCUREMENT_STATUS: Record<string, StatusMeta> = {
  SUBMITTED: { label: "Received", tone: "blue" },
  APPROVED: { label: "Approved", tone: "violet" },
  REJECTED: { label: "Rejected", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
  DELIVERED: { label: "Delivered", tone: "green" },
};

export const DISPATCH_STATUS: Record<string, StatusMeta> = {
  NOT_DISPATCHED: { label: "Not dispatched", tone: "gray" },
  PACKING: { label: "Packing", tone: "amber" },
  DISPATCHED: { label: "Dispatched", tone: "blue" },
  IN_TRANSIT: { label: "In transit", tone: "violet" },
  DELIVERED: { label: "Delivered", tone: "green" },
};
/** The order a shipment moves through. */
export const DISPATCH_FLOW = ["NOT_DISPATCHED", "PACKING", "DISPATCHED", "IN_TRANSIT", "DELIVERED"] as const;

export const ORDER_PRIORITY: Record<string, StatusMeta> = {
  NORMAL: { label: "Normal", tone: "gray" },
  URGENT: { label: "Urgent", tone: "red" },
};

export const TRANSFER_STATUS: Record<string, StatusMeta> = {
  IN_TRANSIT: { label: "In transit", tone: "violet" },
  RECEIVED: { label: "Received", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const STOCK_COUNT_STATUS: Record<string, StatusMeta> = {
  IN_PROGRESS: { label: "In progress", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const LEDGER_TYPE: Record<string, StatusMeta> = {
  INVOICE: { label: "Invoice", tone: "blue" },
  PAYMENT: { label: "Payment", tone: "green" },
  CREDIT_NOTE: { label: "Credit note", tone: "violet" },
  ADJUSTMENT: { label: "Adjustment", tone: "amber" },
};

export const LEDGER_STATUS: Record<string, StatusMeta> = {
  POSTED: { label: "Posted", tone: "green" },
  PENDING_VERIFICATION: { label: "Awaiting verification", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const VOUCHER_STATUS: Record<string, StatusMeta> = {
  SUBMITTED: { label: "Submitted", tone: "blue" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const VOUCHER_KIND = { EXPENSE: "Expense", PAYMENT_TO_YADEA: "Payment to YADEA" } as const;

export const VOUCHER_DOC_KIND = {
  PROOF_OF_PAYMENT: "Proof of payment",
  PROOF_OF_INVOICE: "Proof of invoice",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  OTHER: "Other",
} as const;

export const EXPENSE_CATEGORIES = [
  "Rent & utilities", "Salaries & wages", "Marketing & advertising", "Showroom maintenance", "Transport & logistics",
  "Spare parts purchase", "Taxes & government fees", "Insurance", "Office supplies", "Other",
] as const;

export const DEALER_DOC_CATEGORY = {
  REGISTRATION_CERTIFICATE: "Certificate of registration",
  BUSINESS_LICENSE: "Business licence",
  TAX_REGISTRATION: "Tax registration",
  AGREEMENT: "Dealership agreement",
  ACHIEVEMENT_CERTIFICATE: "Achievement certificate",
  OTHER: "Other",
} as const;

export const INVENTORY_REASON: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  SALE: "Customer sale",
  SALE_CANCELLED: "Sale cancelled",
  SERVICE_USE: "Used on a job card",
  SERVICE_RETURN: "Returned from a job card",
  PROCUREMENT_RECEIPT: "Received from YADEA",
  ADJUSTMENT: "Stock adjustment",
  RETURN: "Customer return",
  DAMAGE: "Damaged / written off",
  TRANSFER_OUT: "Transferred to another outlet",
  TRANSFER_IN: "Transfer received / returned",
  COUNT_VARIANCE: "Stock count correction",
};

export const PAYMENT_METHOD_LABEL = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", MOBILE_WALLET: "Mobile wallet", OTHER: "Other" } as const;

export type StockState = "OUT" | "LOW" | "OK";
export function stockState(quantity: number, reorderLevel: number): StockState {
  if (quantity <= 0) return "OUT";
  if (reorderLevel > 0 && quantity <= reorderLevel) return "LOW";
  return "OK";
}
export const STOCK_STATE: Record<StockState, StatusMeta> = {
  OUT: { label: "Out of stock", tone: "red" },
  LOW: { label: "Low stock", tone: "amber" },
  OK: { label: "In stock", tone: "green" },
};

/** `B:<id>` for a bike model, `P:<id>` for a spare part — one string identifies any stockable item. */
export type ItemKey = `B:${string}` | `P:${string}`;
export const bikeKey = (id: string): ItemKey => `B:${id}`;
export const partKey = (id: string): ItemKey => `P:${id}`;
export function parseItemKey(key: string): { bikeModelId: string } | { productId: string } | null {
  if (key.startsWith("B:") && key.length > 2) return { bikeModelId: key.slice(2) };
  if (key.startsWith("P:") && key.length > 2) return { productId: key.slice(2) };
  return null;
}

// ── After-sales service

export const SERVICE_BOOKING_STATUS: Record<string, StatusMeta> = {
  REQUESTED: { label: "Requested", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "blue" },
  CHECKED_IN: { label: "Checked in", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
  NO_SHOW: { label: "No-show", tone: "red" },
};
/** Where a booking may go next. CHECKED_IN is reached only by opening a job card. */
export const SERVICE_BOOKING_FLOW: Record<string, string[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CANCELLED", "NO_SHOW"],
  CHECKED_IN: [],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const SERVICE_TYPES = ["Free service", "Periodic service", "Repair", "Battery / charging check", "Warranty inspection", "Accident / body work", "Other"] as const;

export const JOB_CARD_STATUS: Record<string, StatusMeta> = {
  OPEN: { label: "Open", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  AWAITING_PARTS: { label: "Awaiting parts", tone: "amber" },
  COMPLETED: { label: "Ready for delivery", tone: "green" },
  DELIVERED: { label: "Delivered", tone: "gray" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};
/** Parts, labour and details can only change while the job is being worked on. */
export const JOB_CARD_EDITABLE = ["OPEN", "IN_PROGRESS", "AWAITING_PARTS"] as const;
export const JOB_CARD_FLOW: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "AWAITING_PARTS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_PARTS", "COMPLETED", "CANCELLED"],
  AWAITING_PARTS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["DELIVERED", "IN_PROGRESS"],
  DELIVERED: [],
  CANCELLED: [],
};

export const WARRANTY_CLAIM_STATUS: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "gray" },
  SUBMITTED: { label: "Submitted", tone: "blue" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
};
