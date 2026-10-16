import type { Tone } from "@/components/ui/misc";

export const DOC_CATEGORIES = ["ID / CNIC", "Quotation", "Invoice", "Booking form", "Finance", "Delivery", "Other"] as const;

export const PAYMENT_TYPES = { DEPOSIT: "Deposit", BOOKING_FEE: "Booking fee", INSTALLMENT: "Installment", FULL_PAYMENT: "Full payment", OTHER: "Other" } as const;
export const PAYMENT_METHODS = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", MOBILE_WALLET: "Mobile wallet", OTHER: "Other" } as const;
export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "amber" },
  PAID: { label: "Paid", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  REFUNDED: { label: "Refunded", tone: "violet" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const TASK_TYPES = { CALL: "Call", FOLLOW_UP: "Follow-up", EMAIL: "Email", TEST_DRIVE: "Test drive", MEETING: "Meeting", OTHER: "Other" } as const;
export const TASK_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: "Low", tone: "gray" },
  MEDIUM: { label: "Medium", tone: "blue" },
  HIGH: { label: "High", tone: "amber" },
  URGENT: { label: "Urgent", tone: "red" },
};
export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const TEST_DRIVE_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Requested", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "blue" },
  RESCHEDULED: { label: "Rescheduled", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
  NO_SHOW: { label: "No-show", tone: "red" },
};

export const APPLICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  SUBMITTED: { label: "Submitted", tone: "blue" },
  UNDER_REVIEW: { label: "Under review", tone: "violet" },
  INFO_REQUIRED: { label: "Info required", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  WITHDRAWN: { label: "Withdrawn", tone: "gray" },
};

export const DEALERSHIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "amber" },
  ACTIVE: { label: "Active", tone: "green" },
  SUSPENDED: { label: "Suspended", tone: "red" },
  INACTIVE: { label: "Inactive", tone: "gray" },
};

export const SUBMISSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "blue" },
  REVIEWED: { label: "Reviewed", tone: "violet" },
  PROCESSED: { label: "Processed", tone: "green" },
  DUPLICATE: { label: "Duplicate", tone: "amber" },
  SPAM: { label: "Spam", tone: "red" },
  FAILED: { label: "Failed", tone: "red" },
};

export const ORIGIN_LABEL = { COMPANY: "Company-assigned", DEALERSHIP_WALK_IN: "Walk-in" } as const;
export const INQUIRY_TYPES = { TEST_DRIVE: "Test drive", GENERAL_INQUIRY: "General inquiry", WALK_IN: "Walk-in", MANUAL: "Manual entry", OTHER: "Other" } as const;
export const INTERACTION_TYPES = { CALL_LOGGED: "Phone call", WHATSAPP_LOGGED: "WhatsApp", SMS_LOGGED: "SMS", EMAIL_LOGGED: "Email", MEETING_LOGGED: "Meeting" } as const;
export const INQUIRY_CATEGORIES = {
  product_information: "Product information", pricing: "Pricing", availability: "Availability",
  dealership_location: "Dealership location", after_sales: "After-sales inquiry", other: "Other",
} as const;
