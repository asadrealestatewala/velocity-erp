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
  PROCUREMENT_RECEIPT: "Received from YADEA",
  ADJUSTMENT: "Stock adjustment",
  RETURN: "Customer return",
  DAMAGE: "Damaged / written off",
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
