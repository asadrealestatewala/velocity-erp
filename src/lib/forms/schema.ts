// Form schema shared by the builder, the public renderer and the server validator.
// Stored as JSON in Form.draftSchema and immutably in FormVersion.schema.

export const FIELD_TYPES = [
  "text", "email", "phone", "number", "date", "time", "datetime", "select", "radio",
  "checkbox", "checkboxes", "textarea", "file", "consent", "heading",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text", email: "Email", phone: "Phone", number: "Number", date: "Date", time: "Time",
  datetime: "Date & time", select: "Dropdown", radio: "Radio buttons", checkbox: "Single checkbox",
  checkboxes: "Checkbox group", textarea: "Text area", file: "File upload", consent: "Privacy consent",
  heading: "Section heading",
};

/** Dynamic option sources resolved from the database at render and validation time. */
export const OPTION_SOURCES = ["cities", "outlets", "bikeModels", "provinces"] as const;
export type OptionSource = (typeof OPTION_SOURCES)[number];

/** How a field feeds the CRM when a submission is processed. */
export const CRM_MAPPINGS = {
  salutation: "Contact · Salutation",
  firstName: "Contact · First name",
  lastName: "Contact · Last name",
  email: "Contact · Email",
  phone: "Contact · Phone",
  province: "Contact · Province",
  city: "Contact · City",
  outlet: "Lead · Selected outlet / dealership",
  bikeModel: "Lead · Interested bike model",
  testDriveDate: "Test drive · Preferred date",
  testDriveTime: "Test drive · Preferred time",
  message: "Lead · Inquiry description",
  inquiryCategory: "Lead · Inquiry category",
  preferredContactMethod: "Contact · Preferred contact method",
  businessName: "Application · Business name",
  businessAddress: "Application · Business address",
  yearsInBusiness: "Application · Years in automotive business",
  isOemDealer: "Application · Currently an OEM dealer",
  propertyOwnership: "Application · Property ownership",
  businessStructure: "Application · Business structure",
  attachments: "Attachments",
  consent: "Privacy consent",
} as const;
export type CrmMapping = keyof typeof CRM_MAPPINGS;

export type FieldOption = { label: string; value: string };

export type FieldCondition = {
  field: string; // key of another field
  op: "equals" | "notEquals" | "notEmpty" | "empty";
  value?: string;
};

export type FormField = {
  id: string;
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  width: "full" | "half" | "third";
  options?: FieldOption[];
  optionsSource?: OptionSource | null;
  /** For `outlets`: the key of the city field it depends on. For `cities`: optional province field. */
  dependsOn?: string;
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string; patternMessage?: string };
  conditional?: FieldCondition | null;
  mapTo?: CrmMapping | null;
  accept?: "image" | "document";
  maxFiles?: number;
};

export type RoutingPolicy = "SELECTED_OUTLET" | "CITY_AUTO" | "MANUAL";

export type FormSettings = {
  title: string;
  subtitle?: string;
  headerImageUrl?: string;
  primaryColor: string;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  privacyPolicyUrl?: string;
  consentText?: string;
  routing: RoutingPolicy;
  /** Lead source key automatically attached to submissions */
  sourceKey: string;
  /** Allow city-based auto routing when no outlet was chosen */
  allowCityFallback?: boolean;
  cardTitle?: string;
};

export type FormSchema = { fields: FormField[] };

export function isFieldVisible(field: FormField, values: Record<string, unknown>) {
  const c = field.conditional;
  if (!c || !c.field) return true;
  const raw = values[c.field];
  const v = Array.isArray(raw) ? raw.join(",") : raw == null ? "" : String(raw);
  switch (c.op) {
    case "equals":
      return v === (c.value ?? "");
    case "notEquals":
      return v !== (c.value ?? "");
    case "notEmpty":
      return v !== "" && v !== "false";
    case "empty":
      return v === "" || v === "false";
    default:
      return true;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type SubmittedValues = Record<string, string | string[] | boolean>;

/**
 * Validate raw values against a schema. Hidden (conditional) fields are dropped.
 * Dynamic option membership (cities/outlets/models) is checked separately on the server.
 */
export function validateValues(
  fields: FormField[],
  raw: Record<string, string | string[] | undefined>,
  fileCounts: Record<string, number> = {},
) {
  const errors: Record<string, string> = {};
  const values: SubmittedValues = {};

  // First pass: collect raw values so conditions can be evaluated against them
  const prelim: Record<string, unknown> = {};
  for (const f of fields) prelim[f.key] = raw[f.key];

  for (const f of fields) {
    if (f.type === "heading") continue;
    if (!isFieldVisible(f, prelim)) continue;
    const r = raw[f.key];

    if (f.type === "file") {
      const n = fileCounts[f.key] ?? 0;
      if (f.required && n === 0) errors[f.key] = `${f.label} is required`;
      if (f.maxFiles && n > f.maxFiles) errors[f.key] = `Upload at most ${f.maxFiles} file(s)`;
      continue;
    }

    if (f.type === "checkbox" || f.type === "consent") {
      const checked = r === "on" || r === "true" || r === "1" || r === "yes";
      if (f.required && !checked) errors[f.key] = f.type === "consent" ? "You must accept to continue" : `${f.label} is required`;
      values[f.key] = checked;
      continue;
    }

    if (f.type === "checkboxes") {
      const arr = (Array.isArray(r) ? r : r ? [r] : []).map((s) => s.trim()).filter(Boolean);
      if (f.required && arr.length === 0) errors[f.key] = `Select at least one option`;
      if (f.options?.length && arr.some((a) => !f.options!.some((o) => o.value === a))) errors[f.key] = "Invalid selection";
      values[f.key] = arr;
      continue;
    }

    const s = (Array.isArray(r) ? r[0] : r)?.toString().trim() ?? "";
    if (!s) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (s.length > (f.validation?.maxLength ?? (f.type === "textarea" ? 5000 : 300))) {
      errors[f.key] = `${f.label} is too long`;
      continue;
    }
    if (f.validation?.minLength && s.length < f.validation.minLength) {
      errors[f.key] = `${f.label} must be at least ${f.validation.minLength} characters`;
      continue;
    }
    switch (f.type) {
      case "email":
        if (!EMAIL_RE.test(s)) errors[f.key] = "Enter a valid email address";
        break;
      case "phone": {
        const digits = s.replace(/\D/g, "");
        if (!/^[+\d\s()-]+$/.test(s) || digits.length < 10 || digits.length > 15) errors[f.key] = "Enter a valid phone number";
        break;
      }
      case "number": {
        const n = Number(s);
        if (!Number.isFinite(n)) errors[f.key] = "Enter a number";
        else if (f.validation?.min != null && n < f.validation.min) errors[f.key] = `Must be at least ${f.validation.min}`;
        else if (f.validation?.max != null && n > f.validation.max) errors[f.key] = `Must be at most ${f.validation.max}`;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) errors[f.key] = "Enter a valid date";
        break;
      case "time":
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) errors[f.key] = "Enter a valid time";
        break;
      case "datetime":
        if (isNaN(Date.parse(s))) errors[f.key] = "Enter a valid date and time";
        break;
      case "select":
      case "radio":
        if (!f.optionsSource && f.options?.length && !f.options.some((o) => o.value === s)) errors[f.key] = "Invalid selection";
        break;
    }
    if (!errors[f.key] && f.validation?.pattern) {
      try {
        if (!new RegExp(f.validation.pattern).test(s)) errors[f.key] = f.validation.patternMessage ?? `${f.label} is not in the expected format`;
      } catch {
        /* invalid admin regex: ignore */
      }
    }
    if (!errors[f.key]) values[f.key] = s;
  }
  return { values, errors };
}

export function fieldByMapping(fields: FormField[], m: CrmMapping) {
  return fields.find((f) => f.mapTo === m);
}

export function newFieldId() {
  return Math.random().toString(36).slice(2, 10);
}
