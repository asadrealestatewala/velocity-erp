import { z } from "zod";

const optStr = (max = 200) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable().optional());
const optId = z.preprocess((v) => (v === "" ? null : v), z.string().min(1).max(40).nullable().optional());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable().optional());

export const phoneSchema = z
  .string()
  .trim()
  .refine((s) => /^[+\d\s()-]+$/.test(s) && s.replace(/\D/g, "").length >= 10 && s.replace(/\D/g, "").length <= 15, "Enter a valid phone number");

export const contactSchema = z
  .object({
    type: z.enum(["LEAD", "CUSTOMER"]).default("LEAD"),
    salutation: optStr(20),
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: optStr(80),
    dateOfBirth: optDate,
    gender: optStr(20),
    profession: optStr(80),
    phone: z.preprocess((v) => (v === "" ? null : v), phoneSchema.nullable().optional()),
    alternatePhone: optStr(30),
    email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid email").max(160).nullable().optional()),
    businessName: optStr(120),
    website: z.preprocess((v) => (v === "" ? null : v), z.string().trim().url("Enter a full URL, e.g. https://…").max(200).nullable().optional()),
    address: optStr(300),
    cityId: optId,
    provinceId: optId,
    postalCode: optStr(20),
    country: optStr(60),
    sourceId: optId,
    ownerId: optId,
    consentMarketing: z.boolean().default(false),
    preferredContactMethod: optStr(30),
    communicationPrefs: z.object({ phone: z.boolean(), email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() }).partial().default({}),
    // Unset custom fields arrive as undefined from the form; drop them rather than failing validation.
    customFields: z
      .record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null(), z.undefined()]))
      .default({})
      .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string | boolean | number | null>),
  })
  .refine((v) => v.phone || v.email, { path: ["phone"], message: "Provide at least a phone number or an email" });

export type ContactInput = z.input<typeof contactSchema>;

export const leadDetailsSchema = z.object({
  interestedModelId: optId,
  preferredDealershipId: optId,
  inquiryType: z.enum(["TEST_DRIVE", "GENERAL_INQUIRY", "WALK_IN", "MANUAL", "OTHER"]).default("MANUAL"),
  inquiryCategory: optStr(60),
  description: optStr(5000),
  campaign: optStr(120),
  referralDetails: optStr(300),
  nextFollowUpAt: optDate,
});

export const taskSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  description: optStr(2000),
  type: z.enum(["CALL", "FOLLOW_UP", "EMAIL", "TEST_DRIVE", "MEETING", "OTHER"]),
  contactId: optId,
  leadId: optId,
  assignedToId: z.string().min(1, "Choose who will do it"),
  dueAt: z.coerce.date({ message: "Choose a due date" }),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  reminderMinutesBefore: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(10080).nullable()),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Write something").max(5000),
  isPinned: z.boolean().default(false),
  visibility: z.enum(["INTERNAL", "CUSTOMER_SHAREABLE"]).default("INTERNAL"),
  /** Central users only: keep the note central (not shared with the dealership). */
  centralOnly: z.boolean().default(false),
});

export const paymentSchema = z.object({
  type: z.enum(["DEPOSIT", "BOOKING_FEE", "INSTALLMENT", "FULL_PAYMENT", "OTHER"]),
  amount: z.coerce.number({ message: "Enter an amount" }).positive("Must be greater than 0").max(100_000_000),
  currency: z.string().trim().length(3).default("PKR"),
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "MOBILE_WALLET", "OTHER"]),
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"]),
  transactionRef: optStr(120),
  description: optStr(500),
  leadId: optId,
});

export const interactionSchema = z.object({
  type: z.enum(["CALL_LOGGED", "EMAIL_LOGGED", "WHATSAPP_LOGGED", "SMS_LOGGED", "MEETING_LOGGED"]),
  direction: z.enum(["OUTBOUND", "INBOUND"]).default("OUTBOUND"),
  outcome: optStr(60),
  body: optStr(3000),
  leadId: optId,
});

export const stageChangeSchema = z.object({
  leadId: z.string().min(1),
  stageId: z.string().min(1),
  lossReasonId: optId,
  lossNotes: optStr(1000),
  conversionValue: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().nullable().optional()),
  soldModelId: optId,
  conversionNotes: optStr(1000),
  note: optStr(500),
});

export const bookingSchema = z.object({
  contactId: z.string().min(1),
  leadId: optId,
  dealershipId: z.string().min(1, "Choose an outlet"),
  bikeModelId: z.string().min(1, "Choose a model"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  assignedUserId: optId,
  customerNotes: optStr(1000),
  internalNotes: optStr(1000),
  confirmNow: z.boolean().default(false),
});
