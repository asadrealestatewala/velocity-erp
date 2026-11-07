import { z } from "zod";
import { csvRecords, parseCsv } from "@/lib/csv";
import { normalizeChassis } from "@/lib/validation-ops";

/** First-run guidance for a new dealership workspace. Completion is derived from real records — nothing is stored. */
export type DealerSetupCounts = { hasContactDetails: boolean; hasOperatingHours: boolean; activeMembers: number; vehicles: number; customers: number };
export type DealerSetupStep = { key: string; label: string; hint: string; href: string; done: boolean };

type Can = (perm: string) => boolean;

export const DEALER_ONBOARDING_HREF = "/portal/onboarding";
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 512 * 1024;

export function buildDealerChecklist(c: DealerSetupCounts, can: Can): DealerSetupStep[] {
  const steps: (DealerSetupStep & { perm: string })[] = [
    { key: "profile", perm: "team.manage", label: "Add contact details and opening hours", hint: "Customers and YADEA see these on your dealership profile.", href: "/portal/settings", done: c.hasContactDetails && c.hasOperatingHours },
    { key: "team", perm: "team.manage", label: "Invite your team", hint: "Give each salesperson their own sign-in.", href: "/portal/team", done: c.activeMembers > 1 },
    { key: "stock", perm: "inventory.manage", label: "Import your vehicle stock", hint: "Upload a CSV of chassis numbers, or add bikes one by one.", href: `${DEALER_ONBOARDING_HREF}?step=stock`, done: c.vehicles > 0 },
    { key: "customers", perm: "contacts.create", label: "Import your customers", hint: "Bring over existing customers from a CSV so nobody starts from zero.", href: `${DEALER_ONBOARDING_HREF}?step=customers`, done: c.customers > 0 },
  ];
  return steps.filter((s) => can(s.perm)).map(({ perm: _perm, ...s }) => s);
}

export type ImportIssue = { line: number; message: string };
export type ParsedImport<T> = { rows: { line: number; data: T }[]; issues: ImportIssue[]; headerError?: string };

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const vehicleRowSchema = z.object({
  model: z.string().trim().min(1, "Model is required"),
  chassisnumber: z.string({ message: "Chassis number is required" }).transform(normalizeChassis).pipe(z.string().regex(/^[A-Z0-9-]{5,30}$/, "Chassis: letters, digits and dashes only (5–30 characters)")),
  enginenumber: opt(40),
  color: opt(40),
  note: opt(300),
});
export type VehicleRow = z.output<typeof vehicleRowSchema>;

export const customerRowSchema = z
  .object({
    firstname: z.string().trim().min(1, "First name is required").max(80),
    lastname: opt(80),
    phone: opt(30),
    email: z.string().trim().max(120).optional().transform((v) => (v ? v.toLowerCase() : null)),
    address: opt(200),
  })
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) ctx.addIssue({ code: "custom", message: "Phone or email is required" });
    if (v.email && !z.string().email().safeParse(v.email).success) ctx.addIssue({ code: "custom", message: "Email is not valid" });
  });
export type CustomerRow = z.output<typeof customerRowSchema>;

export const VEHICLE_CSV_HEADER = ["model", "chassis_number", "engine_number", "color", "note"];
export const CUSTOMER_CSV_HEADER = ["first_name", "last_name", "phone", "email", "address"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWith<T>(text: string, schema: z.ZodType<T, z.ZodTypeDef, any>, required: string[], uniqueKey?: (d: T) => string): ParsedImport<T> {
  const parsed = parseCsv(text);
  const records = csvRecords(parsed);
  const keys = new Set(Object.keys(records[0]?.values ?? Object.fromEntries((parsed[0] ?? []).map((h) => [h.trim().toLowerCase().replace(/[\s_-]+/g, ""), 1]))));
  const missing = required.filter((r) => !keys.has(r));
  if (parsed.length === 0) return { rows: [], issues: [], headerError: "The file is empty." };
  if (missing.length) return { rows: [], issues: [], headerError: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  if (records.length > MAX_IMPORT_ROWS) return { rows: [], issues: [], headerError: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };
  const rows: { line: number; data: T }[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    const res = schema.safeParse(r.values);
    if (!res.success) { issues.push({ line: r.line, message: res.error.issues.map((i) => i.message).join("; ") }); continue; }
    if (uniqueKey) {
      const k = uniqueKey(res.data);
      if (seen.has(k)) { issues.push({ line: r.line, message: `Duplicate of an earlier row (${k})` }); continue; }
      seen.add(k);
    }
    rows.push({ line: r.line, data: res.data });
  }
  return { rows, issues };
}

export const parseVehicleCsv = (text: string) => parseWith<VehicleRow>(text, vehicleRowSchema, ["model", "chassisnumber"], (d) => d.chassisnumber);
export const parseCustomerCsv = (text: string) => parseWith<CustomerRow>(text, customerRowSchema, ["firstname"]);
