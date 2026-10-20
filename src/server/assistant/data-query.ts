import "server-only";
import {
  Prisma, ActivityType, ApplicationStatus, ContactType, DealershipStatus, DealershipType, DispatchStatus, InquiryType, LeadOrigin, LedgerEntryStatus, LedgerEntryType,
  ModelAvailability, PaymentMethod, ProcurementStatus, SalesOrderStatus, StageKind, SubmissionStatus, TaskPriority, TaskStatus, TaskType, TestDriveStatus,
  VoucherKind, VoucherStatus,
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, childScope, contactScope, dealershipIds, isCentral, leadScope, taskScope, testDriveScope } from "@/server/authz";
import { AppError } from "@/server/errors";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { addDays, dayStart, parseDateToken, tzYmd, weekStart } from "./dates";

/**
 * A read-only, permission-scoped query engine over the platform's own data. The AI (and the built-in guide) describe a
 * question as a small structured query — entity, filters, grouping, a count/sum/average — and this module runs it.
 *
 *  - Only the entities and fields listed below can be queried; there is no raw SQL and no free-form column access.
 *  - Every query is AND-ed with the same scope the app uses for that data (contactScope, leadScope, a dealership's own
 *    records…), so a user can never see or count anything outside what their role can already open.
 *  - Results are capped; sensitive columns (password hashes, tokens, IP addresses…) are not in the field lists at all.
 */

// ───────── Entity catalogue ─────────

type FieldType = "string" | "number" | "date" | "boolean" | "enum";
type Field = {
  /** Prisma path, across relations (e.g. `currentLead.stage.name`). */
  path: string;
  type: FieldType;
  values?: string[];
  /** Words people use for an enum value, mapped to the real value. */
  aliases?: Record<string, string>;
  /** The scalar that is null when the field has no value (defaults to the path, or `<relation>Id` for `relation.field`). */
  nullPath?: string;
  /** The value itself (reached through a relation) can be empty — test it, not the relation's foreign key. */
  leaf?: boolean;
  /** A text field matched against several columns at once (e.g. a person's name in first OR last name). */
  anyOf?: string[];
  hidden?: (u: CurrentUser) => boolean;
};
type Row = Record<string, unknown>;
type Delegate = {
  count: (a: { where: unknown }) => Promise<number>;
  findMany: (a: { where: unknown; select: unknown; orderBy?: unknown; take: number }) => Promise<Row[]>;
};
const dlg = (x: unknown) => x as Delegate;

type Entity = {
  key: string;
  about: string;
  access: (u: CurrentUser) => boolean;
  scope: (u: CurrentUser) => unknown;
  base?: unknown;
  delegate: () => Delegate;
  fields: Record<string, Field>;
  columns: string[];
  sort: { field: string; dir: "asc" | "desc" };
  /** Extra columns selected only to build a link to the record. */
  link?: { select: string[]; build: (u: CurrentUser, row: Row) => string | null };
};

const s = (path: string, extra: Partial<Field> = {}): Field => ({ path, type: "string", ...extra });
const n = (path: string): Field => ({ path, type: "number" });
const dt = (path: string): Field => ({ path, type: "date" });
const b = (path: string): Field => ({ path, type: "boolean" });
const e = (path: string, values: object, aliases?: Record<string, string>): Field => ({ path, type: "enum", values: Object.values(values) as string[], aliases });

const NONE = "__no_access__";
const ownDealerships = (u: CurrentUser) => (isCentral(u) ? {} : { dealershipId: { in: dealershipIds(u).length ? dealershipIds(u) : [NONE] } });
const portalBase = (u: CurrentUser) => (u.scope === "DEALERSHIP" ? "/portal/contacts" : "/crm/contacts");

const ENTITY_LIST: Entity[] = [
  {
    key: "contacts",
    about: "People in the CRM — leads and customers (archived contacts excluded). The stage/dealership/sales_rep/interested_model fields come from the contact's current lead.",
    access: (u) => can(u, "contacts.view"),
    scope: contactScope,
    base: { isArchived: false },
    delegate: () => dlg(db.contact),
    fields: {
      type: e("type", ContactType),
      name: s("firstName", { anyOf: ["firstName", "lastName"] }), first_name: s("firstName"), last_name: s("lastName"), phone: s("phone"), email: s("email"),
      city: s("city.name"), province: s("province.name"), source: s("source.name"), owner: s("owner.name"),
      business_name: s("businessName"), profession: s("profession"), gender: s("gender"), marketing_consent: b("consentMarketing"),
      created_at: dt("createdAt"), last_activity_at: dt("lastActivityAt"),
      stage: s("currentLead.stage.name", { nullPath: "currentLeadId" }), dealership: s("currentLead.dealership.name", { nullPath: "currentLead.dealershipId" }),
      sales_rep: s("currentLead.assignedUser.name", { nullPath: "currentLead.assignedUserId" }), interested_model: s("currentLead.interestedModel.name", { nullPath: "currentLead.interestedModelId" }),
      lead_origin: e("currentLead.origin", LeadOrigin), next_follow_up_at: { ...dt("currentLead.nextFollowUpAt"), leaf: true },
    },
    columns: ["first_name", "last_name", "type", "phone", "email", "city", "stage", "dealership", "created_at"],
    sort: { field: "created_at", dir: "desc" },
    link: { select: ["id"], build: (u, r) => (r.id ? `${portalBase(u)}/${String(r.id)}` : null) },
  },
  {
    key: "leads",
    about: "Leads (inquiries), each with a pipeline stage, source, dealership and sales rep. A contact can have several. Archived leads excluded.",
    access: (u) => can(u, "contacts.view"),
    scope: leadScope,
    base: { isArchived: false },
    delegate: () => dlg(db.lead),
    fields: {
      number: n("number"), contact_name: s("contact.firstName", { anyOf: ["contact.firstName", "contact.lastName"] }), contact_first_name: s("contact.firstName"), contact_last_name: s("contact.lastName"), contact_phone: s("contact.phone", { leaf: true }), contact_email: s("contact.email", { leaf: true }),
      stage: s("stage.name"), stage_kind: e("stage.kind", StageKind), source: s("source.name"), origin: e("origin", LeadOrigin), inquiry_type: e("inquiryType", InquiryType),
      dealership: s("dealership.name"), sales_rep: s("assignedUser.name"), city: s("city.name"), interested_model: s("interestedModel.name"), sold_model: s("soldModel.name"),
      loss_reason: s("lossReason.name"), campaign: s("campaign"), conversion_value: n("conversionValue"),
      created_at: dt("createdAt"), assigned_at: dt("assignedAt"), first_contacted_at: dt("firstContactedAt"), last_contacted_at: dt("lastContactedAt"),
      next_follow_up_at: dt("nextFollowUpAt"), converted_at: dt("convertedAt"), lost_at: dt("lostAt"),
    },
    columns: ["number", "contact_first_name", "contact_last_name", "stage", "dealership", "sales_rep", "interested_model", "created_at"],
    sort: { field: "created_at", dir: "desc" },
    link: { select: ["contactId"], build: (u, r) => (r.contactId ? `${portalBase(u)}/${String(r.contactId)}` : null) },
  },
  {
    key: "test_drives",
    about: "Test-drive bookings.",
    access: (u) => can(u, "testdrives.view"),
    scope: testDriveScope,
    delegate: () => dlg(db.testDriveBooking),
    fields: {
      number: n("number"), status: e("status", TestDriveStatus, { NOSHOW: "NO_SHOW" }), scheduled_at: dt("scheduledAt"), completed_at: dt("completedAt"), created_at: dt("createdAt"),
      dealership: s("dealership.name"), city: s("city.name"), bike_model: s("bikeModel.name"), assigned_rep: s("assignedUser.name"),
      customer_name: s("contact.firstName", { anyOf: ["contact.firstName", "contact.lastName"] }), customer_first_name: s("contact.firstName"), customer_last_name: s("contact.lastName"), customer_phone: s("contact.phone", { leaf: true }),
    },
    columns: ["number", "scheduled_at", "status", "customer_first_name", "customer_last_name", "bike_model", "dealership"],
    sort: { field: "scheduled_at", dir: "desc" },
  },
  {
    key: "tasks",
    about: "Tasks and follow-ups.",
    access: (u) => can(u, "tasks.manage"),
    scope: taskScope,
    delegate: () => dlg(db.task),
    fields: {
      title: s("title"), type: e("type", TaskType), priority: e("priority", TaskPriority), status: e("status", TaskStatus), due_at: dt("dueAt"), completed_at: dt("completedAt"), created_at: dt("createdAt"),
      assignee: s("assignedTo.name"), dealership: s("dealership.name"), contact_name: s("contact.firstName", { anyOf: ["contact.firstName", "contact.lastName"] }), contact_first_name: s("contact.firstName"), contact_last_name: s("contact.lastName"),
    },
    columns: ["title", "type", "priority", "status", "due_at", "assignee", "contact_first_name"],
    sort: { field: "due_at", dir: "asc" },
  },
  {
    key: "activities",
    about: "The activity timeline: calls, messages, notes, stage changes, test drives, orders and more.",
    access: (u) => can(u, "contacts.view"),
    scope: (u) => ({ AND: [{ lead: leadScope(u) }, childScope(u)] }),
    delegate: () => dlg(db.activity),
    fields: {
      type: e("type", ActivityType), occurred_at: dt("occurredAt"), direction: s("direction"), outcome: s("outcome"), title: s("title"),
      user: s("user.name"), dealership: s("dealership.name"), contact_name: s("contact.firstName", { anyOf: ["contact.firstName", "contact.lastName"] }), contact_first_name: s("contact.firstName"), contact_last_name: s("contact.lastName"),
    },
    columns: ["occurred_at", "type", "title", "user", "contact_first_name", "contact_last_name"],
    sort: { field: "occurred_at", dir: "desc" },
  },
  {
    key: "dealerships",
    about: "The dealership and outlet network (head office only).",
    access: (u) => isCentral(u) && can(u, "dealerships.view"),
    scope: () => ({}),
    delegate: () => dlg(db.dealership),
    fields: {
      name: s("name"), code: s("code"), type: e("type", DealershipType), status: e("status", DealershipStatus), accepts_leads: b("acceptsLeads"), reps_see_all_leads: b("repsSeeAllLeads"),
      city: s("city.name"), province: s("province.name"), email: s("email"), phone: s("phone"), opening_date: dt("openingDate"), created_at: dt("createdAt"), test_drive_slot_capacity: n("testDriveSlotCapacity"),
    },
    columns: ["name", "code", "type", "status", "accepts_leads", "city"],
    sort: { field: "name", dir: "asc" },
  },
  {
    key: "stock_orders",
    about: "Dealership stock orders placed with YADEA procurement. Status SUBMITTED is shown in the app as “Received”.",
    access: (u) => (isCentral(u) ? can(u, "procurement.view") : can(u, "procurement.order")),
    scope: ownDealerships,
    delegate: () => dlg(db.procurementOrder),
    fields: {
      number: n("number"), status: e("status", ProcurementStatus, { RECEIVED: "SUBMITTED" }), dispatch_status: e("dispatchStatus", DispatchStatus), priority: s("priority"), dealership: s("dealership.name"),
      expected_delivery_date: dt("expectedDeliveryDate"), submitted_at: dt("submittedAt"), approved_at: dt("approvedAt"), dispatched_at: dt("dispatchedAt"), delivered_at: dt("deliveredAt"),
      subtotal: n("subtotal"), courier: s("courier"), tracking_number: s("trackingNumber"), rejection_reason: s("rejectionReason"),
    },
    columns: ["number", "dealership", "status", "dispatch_status", "expected_delivery_date", "subtotal", "submitted_at"],
    sort: { field: "submitted_at", dir: "desc" },
  },
  {
    key: "customer_orders",
    about: "Customer purchase orders raised by a dealership (dealership users only). Confirming one deducts stock.",
    access: (u) => !isCentral(u) && can(u, "inventory.view"),
    scope: ownDealerships,
    delegate: () => dlg(db.salesOrder),
    fields: {
      number: n("number"), status: e("status", SalesOrderStatus), dealership: s("dealership.name"), customer_name: s("customerName"),
      order_date: dt("orderDate"), confirmed_at: dt("confirmedAt"), cancelled_at: dt("cancelledAt"), subtotal: n("subtotal"), discount: n("discount"), total: n("total"),
    },
    columns: ["number", "order_date", "customer_name", "status", "total"],
    sort: { field: "order_date", dir: "desc" },
  },
  {
    key: "inventory",
    about: "Showroom stock: one row per bike model or spare part per dealership.",
    access: (u) => (isCentral(u) ? can(u, "inventory.view_all") : can(u, "inventory.view")),
    scope: ownDealerships,
    delegate: () => dlg(db.inventoryItem),
    fields: {
      dealership: s("dealership.name"), bike_model: s("bikeModel.name"), bike_code: s("bikeModel.code"), part: s("product.name"), part_sku: s("product.sku"), part_category: s("product.category"),
      quantity: n("quantity"), reorder_level: n("reorderLevel"), updated_at: dt("updatedAt"),
    },
    columns: ["dealership", "bike_model", "part", "quantity", "reorder_level"],
    sort: { field: "quantity", dir: "asc" },
  },
  {
    key: "ledger",
    about: "Dealer account ledger entries (invoices, payments, credit notes, adjustments). Balance owed = sum of debit − sum of credit over POSTED entries.",
    access: (u) => can(u, "ledger.view"),
    scope: ownDealerships,
    delegate: () => dlg(db.ledgerEntry),
    fields: {
      number: n("number"), dealership: s("dealership.name"), type: e("type", LedgerEntryType), status: e("status", LedgerEntryStatus, { AWAITING_VERIFICATION: "PENDING_VERIFICATION", PENDING: "PENDING_VERIFICATION" }),
      entry_date: dt("entryDate"), reference: s("reference"), description: s("description"), debit: n("debit"), credit: n("credit"), method: e("method", PaymentMethod), created_at: dt("createdAt"),
    },
    columns: ["number", "entry_date", "dealership", "type", "status", "debit", "credit"],
    sort: { field: "entry_date", dir: "desc" },
  },
  {
    key: "vouchers",
    about: "Expense vouchers with receipts and invoices, kept for tax records.",
    access: (u) => (isCentral(u) ? can(u, "vouchers.view_all") : can(u, "vouchers.manage")),
    scope: ownDealerships,
    delegate: () => dlg(db.expenseVoucher),
    fields: {
      number: n("number"), dealership: s("dealership.name"), kind: e("kind", VoucherKind), status: e("status", VoucherStatus), voucher_date: dt("voucherDate"), category: s("category"), payee: s("payee"),
      amount: n("amount"), tax_amount: n("taxAmount"), method: e("method", PaymentMethod), reference: s("reference"), created_at: dt("createdAt"),
    },
    columns: ["number", "voucher_date", "dealership", "category", "payee", "amount", "status"],
    sort: { field: "voucher_date", dir: "desc" },
  },
  {
    key: "applications",
    about: "Applications to become a YADEA dealer (head office only).",
    access: (u) => isCentral(u) && can(u, "applications.view"),
    scope: () => ({}),
    delegate: () => dlg(db.dealershipApplication),
    fields: {
      number: n("number"), business_name: s("businessName"), applicant_name: s("firstName", { anyOf: ["firstName", "lastName"] }), first_name: s("firstName"), last_name: s("lastName"), status: e("status", ApplicationStatus), city: s("city.name"), province: s("province.name"),
      years_in_business: n("yearsInBusiness"), is_oem_dealer: b("isOemDealer"), reviewer: s("reviewer.name"), created_at: dt("createdAt"), approved_at: dt("approvedAt"), rejected_at: dt("rejectedAt"),
    },
    columns: ["number", "business_name", "status", "city", "created_at"],
    sort: { field: "created_at", dir: "desc" },
  },
  {
    key: "submissions",
    about: "Public form submissions (head office only).",
    access: (u) => isCentral(u) && can(u, "submissions.view"),
    scope: () => ({}),
    delegate: () => dlg(db.formSubmission),
    fields: {
      number: n("number"), form: s("form.name"), status: e("status", SubmissionStatus), name: s("firstName", { anyOf: ["firstName", "lastName"] }), first_name: s("firstName"), last_name: s("lastName"), phone: s("phone"), email: s("email"),
      city: s("city.name"), dealership: s("dealership.name"), bike_model: s("bikeModel.name"), source: s("source.name"), is_duplicate: b("isDuplicate"), consent_given: b("consentGiven"),
      test_drive_at: dt("testDriveAt"), created_at: dt("createdAt"),
    },
    columns: ["number", "form", "status", "first_name", "last_name", "city", "created_at"],
    sort: { field: "created_at", dir: "desc" },
  },
  {
    key: "users",
    about: "Head-office and dealership user accounts (users.manage only).",
    access: (u) => isCentral(u) && can(u, "users.manage"),
    scope: () => ({}),
    delegate: () => dlg(db.user),
    fields: {
      name: s("name"), email: s("email"), phone: s("phone"), role: s("role.name"), department: s("department.name"), is_active: b("isActive"), last_login_at: dt("lastLoginAt"), created_at: dt("createdAt"),
    },
    columns: ["name", "email", "role", "is_active", "last_login_at"],
    sort: { field: "name", dir: "asc" },
  },
  {
    key: "bike_models",
    about: "The bike model catalogue. Prices are only what an administrator entered.",
    access: (u) => can(u, "assistant.use"),
    scope: () => ({}),
    delegate: () => dlg(db.bikeModel),
    fields: { name: s("name"), code: s("code"), category: s("category"), price: n("price"), dealer_price: n("dealerPrice"), availability: e("availability", ModelAvailability), is_active: b("isActive"), created_at: dt("createdAt") },
    columns: ["name", "code", "category", "price", "dealer_price", "availability"],
    sort: { field: "name", dir: "asc" },
  },
  {
    key: "spare_parts",
    about: "The spare-parts catalogue. Prices are only what an administrator entered.",
    access: (u) => can(u, "assistant.use"),
    scope: () => ({}),
    delegate: () => dlg(db.product),
    fields: { sku: s("sku"), name: s("name"), category: s("category"), unit: s("unit"), price: n("price"), dealer_price: n("dealerPrice"), is_active: b("isActive"), created_at: dt("createdAt") },
    columns: ["sku", "name", "category", "price", "dealer_price"],
    sort: { field: "name", dir: "asc" },
  },
  {
    key: "audit_log",
    about: "The audit log of sensitive actions (head office: everything; a dealership: its own). Dealerships don't see who the head-office actor was.",
    access: (u) => can(u, "audit.view"),
    scope: ownDealerships,
    delegate: () => dlg(db.auditLog),
    fields: {
      action: s("action"), entity_type: s("entityType"), created_at: dt("createdAt"), dealership: s("dealership.name"),
      user: s("user.name", { hidden: (u) => !isCentral(u) }),
    },
    columns: ["created_at", "action", "entity_type", "dealership"],
    sort: { field: "created_at", dir: "desc" },
  },
];

export const ENTITIES: Record<string, Entity> = Object.fromEntries(ENTITY_LIST.map((x) => [x.key, x]));
const ENTITY_ALIASES: Record<string, string> = {
  contact: "contacts", customers: "contacts", people: "contacts", lead: "leads", testdrives: "test_drives", test_drive: "test_drives", testdrive: "test_drives", task: "tasks",
  activity: "activities", dealership: "dealerships", dealers: "dealerships", outlets: "dealerships", stock_order: "stock_orders", purchase_orders: "stock_orders", orders: "stock_orders",
  sales_orders: "customer_orders", customer_order: "customer_orders", stock: "inventory", ledger_entries: "ledger", voucher: "vouchers", expenses: "vouchers", application: "applications",
  submission: "submissions", user: "users", models: "bike_models", bikes: "bike_models", parts: "spare_parts", audit: "audit_log", auditlog: "audit_log",
};

export function entityFor(key: string): Entity | null {
  const k = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ENTITIES[k] ?? ENTITIES[ENTITY_ALIASES[k] ?? ""] ?? null;
}

/** A compact description of everything that can be queried, for the model's tool description. */
export function catalogText(): string {
  const type = (f: Field) => (f.type === "enum" ? `enum ${f.values!.join("|")}` : f.type);
  return ENTITY_LIST.map((x) => `• ${x.key} — ${x.about}\n  fields: ${Object.entries(x.fields).map(([k, f]) => `${k} (${type(f)})`).join(", ")}`).join("\n");
}

/** Which entities this user may query, with their field names (used by the built-in guide). */
export const entitiesFor = (u: CurrentUser) => ENTITY_LIST.filter((x) => x.access(u));

// ───────── Query model ─────────

const OPS = ["eq", "neq", "contains", "in", "not_in", "gt", "gte", "lt", "lte", "is_null", "not_null", "is_true", "is_false"] as const;
const OPS_BY_TYPE: Record<FieldType, readonly (typeof OPS)[number][]> = {
  string: ["eq", "neq", "contains", "in", "not_in", "is_null", "not_null"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "not_null"],
  date: ["eq", "gt", "gte", "lt", "lte", "is_null", "not_null"],
  boolean: ["is_true", "is_false", "eq", "neq", "is_null", "not_null"],
  enum: ["eq", "neq", "in", "not_in", "is_null", "not_null"],
};

export const dataQuerySchema = z.object({
  entity: z.string().min(1).max(40),
  filters: z.array(z.object({
    field: z.string().min(1).max(60),
    op: z.enum(OPS),
    value: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.union([z.string().max(200), z.number()])).max(20)]).optional(),
  })).max(10).optional(),
  metric: z.enum(["count", "sum", "avg", "min", "max"]).optional(),
  metric_field: z.string().max(60).optional(),
  group_by: z.string().max(60).optional(),
  bucket: z.enum(["day", "week", "month", "year"]).optional(),
  show_rows: z.boolean().optional(),
  columns: z.array(z.string().max(60)).max(10).optional(),
  order_by: z.string().max(60).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});
export type DataQuery = z.infer<typeof dataQuerySchema>;

export type DataResult = {
  entity: string;
  /** How many records match the filters (exact). */
  matching: number;
  filters: string[];
  metric?: { kind: string; field: string | null; value: number | string | null };
  groups?: { key: string; value: number }[];
  groups_note?: string;
  rows?: Row[];
  truncated?: boolean;
  note?: string;
};

const MAX_ROWS = 20_000;
const MAX_GROUPS = 40;

// ───────── Building the Prisma query ─────────

function nest(path: string, leaf: unknown): Row {
  return path.split(".").reduceRight<unknown>((inner, key) => ({ [key]: inner }), leaf) as Row;
}
const getPath = (row: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Row)[k] : undefined), row);

function selectFor(paths: string[]): Row {
  const root: Row = {};
  for (const p of paths) {
    const parts = p.split(".");
    let cur = root;
    parts.forEach((key, i) => {
      if (i === parts.length - 1) { cur[key] = true; return; }
      const existing = cur[key];
      const node = existing && typeof existing === "object" ? (existing as { select: Row }) : { select: {} as Row };
      cur[key] = node;
      cur = node.select;
    });
  }
  return root;
}

function nullPathOf(f: Field) {
  if (f.nullPath) return f.nullPath;
  if (f.leaf) return f.path;
  const parts = f.path.split(".");
  return parts.length === 1 ? f.path : `${parts.slice(0, -2).concat(`${parts[parts.length - 2]}Id`).join(".")}`;
}

function enumValue(name: string, f: Field, raw: unknown): string {
  const v = String(raw).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliased = f.aliases?.[v] ?? v;
  if (f.values!.includes(aliased)) return aliased;
  const loose = f.values!.find((x) => x.replace(/_/g, "") === aliased.replace(/_/g, ""));
  if (loose) return loose;
  throw new AppError(`“${String(raw)}” isn't a valid value for ${name}. Valid values: ${f.values!.join(", ")}.`);
}
const text = (name: string, raw: unknown): string => {
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  throw new AppError(`${name} needs a single text value.`);
};
const num = (name: string, raw: unknown): number => {
  const v = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(v)) throw new AppError(`${name} needs a number.`);
  return v;
};
const list = (name: string, raw: unknown): (string | number)[] => {
  if (Array.isArray(raw) && raw.length) return raw as (string | number)[];
  throw new AppError(`${name} needs a list of values for “in”.`);
};

function dateCondition(name: string, f: Field, op: string, raw: unknown, now: Date): unknown {
  const bound = parseDateToken(text(name, raw), now);
  const next = dayStart(addDays(tzYmd(bound.at), 1));
  switch (op) {
    case "gte": return nest(f.path, { gte: bound.at });
    case "gt": return nest(f.path, bound.wholeDay ? { gte: next } : { gt: bound.at });
    case "lt": return nest(f.path, { lt: bound.at });
    case "lte": return nest(f.path, bound.wholeDay ? { lt: next } : { lte: bound.at });
    default: return nest(f.path, bound.wholeDay ? { gte: bound.at, lt: next } : { equals: bound.at }); // eq
  }
}

function condition(name: string, f: Field, op: (typeof OPS)[number], raw: unknown, now: Date): unknown {
  if (!OPS_BY_TYPE[f.type].includes(op)) throw new AppError(`“${op}” can't be used on ${name} (${f.type}). Use one of: ${OPS_BY_TYPE[f.type].join(", ")}.`);
  const direct = !f.path.includes(".") || !!f.leaf;
  if (f.anyOf && (op === "is_null" || op === "not_null")) throw new AppError(`${name} combines several columns — use contains / eq on it instead of ${op}.`);
  if (op === "is_null" || op === "not_null") {
    const np = nullPathOf(f);
    if (op === "is_null") return f.type === "string" && direct ? { OR: [nest(np, null), nest(np, "")] } : nest(np, null);
    return f.type === "string" && direct ? { AND: [nest(np, { not: null }), nest(np, { not: "" })] } : nest(np, { not: null });
  }
  if (f.type === "boolean") {
    if (op === "is_true") return nest(f.path, { equals: true });
    if (op === "is_false") return nest(f.path, { equals: false });
    const v = typeof raw === "boolean" ? raw : String(raw).toLowerCase() === "true" || String(raw).toLowerCase() === "yes";
    return op === "eq" ? nest(f.path, { equals: v }) : { NOT: nest(f.path, { equals: v }) };
  }
  if (f.type === "date") return dateCondition(name, f, op, raw, now);
  if (f.type === "number") {
    if (op === "neq") return { NOT: nest(f.path, { equals: num(name, raw) }) };
    const map: Record<string, string> = { eq: "equals", gt: "gt", gte: "gte", lt: "lt", lte: "lte" };
    return nest(f.path, { [map[op]!]: num(name, raw) });
  }
  if (f.type === "enum") {
    if (op === "eq") return nest(f.path, { equals: enumValue(name, f, raw) });
    if (op === "neq") return { NOT: nest(f.path, { equals: enumValue(name, f, raw) }) };
    const values = list(name, raw).map((v) => enumValue(name, f, v));
    return op === "in" ? nest(f.path, { in: values }) : { NOT: nest(f.path, { in: values }) };
  }
  // string (a field with anyOf is matched against each of its columns)
  const across = (leaf: unknown): unknown => (f.anyOf ? { OR: f.anyOf.map((p) => nest(p, leaf)) } : nest(f.path, leaf));
  const ci = (v: unknown) => across({ equals: text(name, v), mode: "insensitive" });
  switch (op) {
    case "eq": return ci(raw);
    case "neq": return { NOT: ci(raw) };
    case "contains": return across({ contains: text(name, raw), mode: "insensitive" });
    case "in": return { OR: list(name, raw).map(ci) };
    default: return { NOT: { OR: list(name, raw).map(ci) } }; // not_in
  }
}

const describeFilter = (name: string, op: string, raw: unknown) => {
  const words: Record<string, string> = { eq: "=", neq: "≠", contains: "contains", in: "in", not_in: "not in", gt: ">", gte: "≥", lt: "<", lte: "≤", is_null: "is empty", not_null: "is set", is_true: "is yes", is_false: "is no" };
  const v = op === "is_null" || op === "not_null" || op === "is_true" || op === "is_false" ? "" : ` ${Array.isArray(raw) ? raw.join(", ") : String(raw)}`;
  return `${name} ${words[op]}${v}`;
};

// ───────── Presentation ─────────

function show(v: unknown, f: Field | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0 ? fmtDate(v) : fmtDateTime(v);
  if (typeof v === "object" && "toString" in (v as object) && f?.type === "number") return Number(String(v));
  if (typeof v === "object") return Number(String(v));
  return v;
}

function bucketKey(d: Date, bucket: "day" | "week" | "month" | "year"): string {
  const ymd = tzYmd(d);
  if (bucket === "day") return ymd;
  if (bucket === "week") return weekStart(ymd);
  if (bucket === "month") return ymd.slice(0, 7);
  return ymd.slice(0, 4);
}

function groupKey(v: unknown, f: Field, bucket: "day" | "week" | "month" | "year"): string {
  if (v === null || v === undefined || v === "") return "(none)";
  if (v instanceof Date) return bucketKey(v, bucket);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ───────── Running a query ─────────

/** A filter the database rejects (e.g. “is empty” on a field that always has a value) becomes a readable error, not a crash. */
async function guarded<T>(entityKey: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientValidationError) throw new AppError(`One of the filters isn't valid for ${entityKey} — for example “is empty” on a field that always has a value, or an operator that doesn't suit the field. Adjust it and try again.`);
    throw e;
  }
}

export async function runDataQuery(user: CurrentUser, raw: unknown, now = new Date()): Promise<DataResult> {
  const parsed = dataQuerySchema.safeParse(raw);
  if (!parsed.success) throw new AppError(`Invalid query: ${parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ")}`);
  const q = parsed.data;

  const entity = entityFor(q.entity);
  if (!entity) throw new AppError(`Unknown entity “${q.entity}”. Available: ${ENTITY_LIST.filter((x) => x.access(user)).map((x) => x.key).join(", ")}.`);
  if (!entity.access(user)) throw new AppError(`Your role doesn't have access to ${entity.key} data.`);

  const visible = Object.entries(entity.fields).filter(([, f]) => !f.hidden?.(user));
  const field = (name: string): Field => {
    const f = entity.fields[name.trim().toLowerCase()];
    if (!f || f.hidden?.(user)) throw new AppError(`${entity.key} has no field “${name}”. Fields: ${visible.map(([k]) => k).join(", ")}.`);
    return f;
  };

  const conditions: unknown[] = [entity.scope(user)];
  if (entity.base) conditions.push(entity.base);
  const applied: string[] = [];
  for (const fl of q.filters ?? []) {
    const f = field(fl.field);
    conditions.push(condition(fl.field, f, fl.op, fl.value, now));
    applied.push(describeFilter(fl.field, fl.op, fl.value));
  }
  const where = { AND: conditions };
  const dl = entity.delegate();
  const matching = await guarded(entity.key, () => dl.count({ where }));
  const out: DataResult = { entity: entity.key, matching, filters: applied };

  const metric = q.metric ?? "count";
  const mf = q.metric_field ? field(q.metric_field) : null;
  if (metric !== "count") {
    if (!mf) throw new AppError(`${metric} needs metric_field (a number field of ${entity.key}).`);
    if (mf.type !== "number" && !(mf.type === "date" && (metric === "min" || metric === "max"))) throw new AppError(`${metric} can't be computed on ${q.metric_field} (${mf.type}).`);
  }

  // Grouping and sum/avg/min/max are computed over the matching rows (capped).
  if (q.group_by || metric !== "count") {
    const gf = q.group_by ? field(q.group_by) : null;
    const paths = [...(gf ? [gf.path] : []), ...(mf ? [mf.path] : [])];
    const select = paths.length ? selectFor(paths) : { id: true };
    const rows = await guarded(entity.key, () => dl.findMany({ where, select, take: MAX_ROWS + 1 }));
    if (rows.length > MAX_ROWS) { out.truncated = true; out.note = `Only the first ${MAX_ROWS.toLocaleString("en-US")} matching records were included in the calculation.`; rows.length = MAX_ROWS; }
    const bucket = q.bucket ?? "month";
    const valueOf = (r: Row): number | null => {
      if (!mf) return null;
      const v = getPath(r, mf.path);
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.getTime();
      const x = Number(String(v));
      return Number.isFinite(x) ? x : null;
    };
    const reduce = (rs: Row[]): number | null => {
      if (metric === "count") return rs.length;
      const vals = rs.map(valueOf).filter((x): x is number => x !== null);
      if (!vals.length) return null;
      if (metric === "sum") return round2(vals.reduce((a, c) => a + c, 0));
      if (metric === "avg") return round2(vals.reduce((a, c) => a + c, 0) / vals.length);
      return metric === "min" ? Math.min(...vals) : Math.max(...vals);
    };
    const dateMetric = mf?.type === "date";
    const fmtMetric = (x: number | null) => (x === null ? null : dateMetric ? fmtDateTime(new Date(x)) : x);
    if (gf && dateMetric) throw new AppError("The earliest/latest of a date can't be combined with group_by — run it without grouping.");
    if (gf) {
      const by = new Map<string, Row[]>();
      for (const r of rows) {
        const k = groupKey(getPath(r, gf.path), gf, bucket);
        (by.get(k) ?? by.set(k, []).get(k)!).push(r);
      }
      let groups = [...by.entries()].map(([key, rs]) => ({ key, value: reduce(rs) ?? 0 }));
      groups = gf.type === "date" ? groups.sort((a, c) => a.key.localeCompare(c.key)) : groups.sort((a, c) => c.value - a.value || a.key.localeCompare(c.key));
      if (groups.length > MAX_GROUPS) { out.groups_note = `Showing ${MAX_GROUPS} of ${groups.length} groups.`; groups = groups.slice(0, MAX_GROUPS); }
      out.groups = groups;
      out.metric = { kind: metric, field: q.metric_field ?? null, value: null };
    } else {
      out.metric = { kind: metric, field: q.metric_field ?? null, value: fmtMetric(reduce(rows)) };
    }
  }

  if (q.show_rows) {
    const cols = (q.columns?.length ? q.columns : entity.columns).map((c) => ({ name: c.trim().toLowerCase(), f: field(c) }));
    const sortName = q.order_by ?? entity.sort.field;
    const sortField = field(sortName);
    const dir = q.order ?? (q.order_by ? "asc" : entity.sort.dir);
    const select = selectFor([...cols.map((c) => c.f.path), ...(entity.link?.select ?? [])]);
    const rows = await guarded(entity.key, () => dl.findMany({ where, select, orderBy: nest(sortField.path, dir), take: q.limit ?? 10 }));
    out.rows = rows.map((r) => {
      const o: Row = {};
      for (const c of cols) o[c.name] = show(getPath(r, c.f.path), c.f);
      const link = entity.link?.build(user, r);
      if (link) o.link = link;
      return o;
    });
  }
  return out;
}
