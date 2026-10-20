import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { isCentral, dealershipIds } from "@/server/authz";
import { AppError } from "@/server/errors";
import { fmtMoney } from "@/lib/utils";
import { addDays, tzYmd, weekStart } from "./dates";
import { ENTITIES, entityFor, runDataQuery, type DataQuery, type DataResult } from "./data-query";

/**
 * Built-in guide mode: turns a plain question about the data — “how many customers have an email?”, “leads per city
 * this month”, “overdue stock orders” — into a structured query for the data engine, and answers with the real result.
 *
 * It is deliberately strict. Every phrase of the question must be understood and turned into a filter; if any part is
 * left over, it says exactly what it could not apply instead of returning a number that quietly ignores it. (A language
 * model connected through ANTHROPIC_API_KEY handles the open-ended questions this cannot.)
 */

export type NlOutcome = { kind: "answer"; text: string; /** true when the question carried filters (status, city, dates…) */ qualified: boolean } | { kind: "refuse"; text: string } | null;

type Filter = NonNullable<DataQuery["filters"]>[number];
type Ctx = { cities: string[]; stages: string[]; sources: string[]; dealerships: string[]; models: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/[-]+/g, " ").replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ───────── What the question is asking for ─────────

const COUNT = /\b(how many|number of|count of|count the|total number|total count|what('?s| is) the (total|number|count))\b/;
const TOTAL = /\b(total|sum|overall)\b.{0,25}\b(value|amount|sales|revenue|invoiced|debit|credit|cost|spend|spent|price|paid|collected)\b|\b(value|amount|sales|revenue|invoiced|spend|spent|paid|collected)\b.{0,20}\b(total|sum|altogether)\b|\bhow much\b.{0,40}\b(sales|revenue|invoiced|spent|spend|worth|paid|collected)\b/;
const AVERAGE = /\b(average|avg|mean)\b/;
const LIST = /^(list|show|display|give me|who are|which|what are|find|get)\b/;
const BY = /\b(by|per|each|for each|breakdown( by)?|split( by)?|group(ed)? by|across)\b/;
const RULE_Q = /\bhow many (days|hours|minutes|times|attempts|characters|files|failed|points|steps|digits|letters)\b|\b(can|could|may|must|should|allowed|limit|maximum|at most|valid|expire|expires)\b|^(how (do|does|to|should)|why|what happens|explain)\b/;

const ENTITY_WORDS: { re: RegExp; entity: string; filters?: Filter[]; central?: string }[] = [
  { re: /\b(customer|sales) orders?\b/, entity: "customer_orders" },
  { re: /\b(stock orders?|purchase orders?|orders? (to|from|with) yadea|deliver(y|ies)|shipments?)\b/, entity: "stock_orders" },
  { re: /\bcustomers?\b|\bclients?\b/, entity: "contacts", filters: [{ field: "type", op: "eq", value: "CUSTOMER" }] },
  { re: /\bcontacts?\b|\bpeople\b|\bpersons?\b/, entity: "contacts" },
  { re: /\bleads?\b/, entity: "leads" },
  { re: /\btest ?drives?\b/, entity: "test_drives" },
  { re: /\b(tasks?|follow ?ups?|to ?dos?)\b/, entity: "tasks" },
  { re: /\b(dealerships?|dealers?|outlets?|showrooms?)\b/, entity: "dealerships" },
  { re: /\b(inventory|stock items?|items in stock)\b/, entity: "inventory" },
  { re: /\binvoices?\b|\binvoiced\b|\bbilled\b/, entity: "ledger", filters: [{ field: "type", op: "eq", value: "INVOICE" }] },
  { re: /\bcredit notes?\b/, entity: "ledger", filters: [{ field: "type", op: "eq", value: "CREDIT_NOTE" }] },
  { re: /\bpaid\b|\bcollected\b/, entity: "ledger", filters: [{ field: "type", op: "eq", value: "PAYMENT" }, { field: "status", op: "eq", value: "POSTED" }] },
  { re: /\b(payments?)\b/, entity: "ledger", filters: [{ field: "type", op: "eq", value: "PAYMENT" }] },
  { re: /\bledger entr(y|ies)\b/, entity: "ledger" },
  { re: /\b(vouchers?|expenses?)\b/, entity: "vouchers" },
  { re: /\bapplications?\b/, entity: "applications" },
  { re: /\b(form )?submissions?\b/, entity: "submissions" },
  { re: /\b(users?|staff|employees|team members?)\b/, entity: "users" },
  { re: /\bspare parts?\b|\bparts\b/, entity: "spare_parts" },
  { re: /\b(bike )?models\b|\bbike models?\b|\bbikes\b/, entity: "bike_models" },
  { re: /\bcalls?\b/, entity: "activities", filters: [{ field: "type", op: "eq", value: "CALL_LOGGED" }] },
  { re: /\bwhatsapp (messages?|chats?)\b/, entity: "activities", filters: [{ field: "type", op: "eq", value: "WHATSAPP_LOGGED" }] },
  { re: /\bactivit(y|ies)\b/, entity: "activities" },
  { re: /\baudit (log )?(entr(y|ies)|records?)\b|\baudit log\b/, entity: "audit_log" },
  { re: /\borders?\b/, entity: "orders?" }, // ambiguous — resolved below
];

const LABEL: Record<string, [string, string]> = {
  contacts: ["contact", "contacts"], leads: ["lead", "leads"], test_drives: ["test drive", "test drives"], tasks: ["task", "tasks"], dealerships: ["dealership", "dealerships"],
  stock_orders: ["stock order", "stock orders"], customer_orders: ["customer order", "customer orders"], inventory: ["stock item", "stock items"], ledger: ["ledger entry", "ledger entries"],
  vouchers: ["voucher", "vouchers"], applications: ["application", "applications"], submissions: ["submission", "submissions"], users: ["user", "users"],
  bike_models: ["bike model", "bike models"], spare_parts: ["spare part", "spare parts"], activities: ["activity", "activities"], audit_log: ["audit entry", "audit entries"],
};
const PAGE: Record<string, [string, string]> = {
  contacts: ["/crm/contacts", "/portal/contacts"], leads: ["/crm/contacts", "/portal/leads"], test_drives: ["/crm/test-drives", "/portal/test-drives"], tasks: ["/crm/tasks", "/portal/tasks"],
  dealerships: ["/crm/dealerships", "/crm/dealerships"], stock_orders: ["/procurement/orders", "/portal/stock-orders"], customer_orders: ["/portal/sales-orders", "/portal/sales-orders"],
  inventory: ["/procurement/stock", "/portal/inventory"], ledger: ["/procurement/ledger", "/portal/ledger"], vouchers: ["/procurement/vouchers", "/portal/vouchers"],
  applications: ["/crm/applications", "/crm/applications"], submissions: ["/crm/submissions", "/crm/submissions"], users: ["/crm/users", "/crm/users"], bike_models: ["/crm/bike-models", "/crm/bike-models"],
  spare_parts: ["/procurement/catalog", "/procurement/catalog"], audit_log: ["/crm/audit", "/portal/audit"],
};

/** The date a date phrase (“today”, “this month”) refers to, per entity. */
const DATE_FIELD: Record<string, string> = {
  contacts: "created_at", leads: "created_at", test_drives: "scheduled_at", tasks: "due_at", dealerships: "created_at", stock_orders: "submitted_at", customer_orders: "order_date",
  inventory: "updated_at", ledger: "entry_date", vouchers: "voucher_date", applications: "created_at", submissions: "created_at", users: "created_at", bike_models: "created_at",
  spare_parts: "created_at", activities: "occurred_at", audit_log: "created_at",
};

/** The field that searches a person's or record's name, per entity. */
const NAME_FIELD: Record<string, string> = {
  contacts: "name", leads: "contact_name", test_drives: "customer_name", tasks: "contact_name", activities: "contact_name", applications: "applicant_name", submissions: "name",
  users: "name", dealerships: "name", bike_models: "name", spare_parts: "name",
};

/** Words for a field (“email”, “sales rep”) → the field name, used by “with / without …” and “by …”. */
const FIELD_WORDS: Record<string, string> = {
  email: "email", "email address": "email", phone: "phone", mobile: "phone", "phone number": "phone", "mobile number": "phone", city: "city", province: "province", source: "source", owner: "owner",
  "sales rep": "sales_rep", salesperson: "sales_rep", rep: "sales_rep", agent: "sales_rep", dealership: "dealership", dealer: "dealership", outlet: "dealership", stage: "stage", status: "status",
  model: "interested_model", "interested model": "interested_model", "bike model": "bike_model", "loss reason": "loss_reason", reason: "loss_reason", "business name": "business_name", profession: "profession",
  type: "type", priority: "priority", assignee: "assignee", category: "category", courier: "courier", "tracking number": "tracking_number", role: "role", department: "department", form: "form",
  method: "method", payee: "payee", campaign: "campaign", gender: "gender", origin: "origin", "dispatch status": "dispatch_status", kind: "kind", action: "action", reviewer: "reviewer",
};

const HARMLESS = new Set(("a an the of in on at for with by from to and or is are was were be been do does did we i me my our us you your it its there here this that these those all any some each every total overall altogether " +
  "currently now so far right yet ever already exist exists existing registered recorded saved stored present available system app application platform crm portal database data records record entries entry " +
  "number count amount many much please can could tell show give list what which who whom how have has had been being were was got get gets that whose").split(" "));

// ───────── Parsing ─────────

type Working = { rest: string };
const take = (w: Working, re: RegExp): RegExpMatchArray | null => {
  const m = re.exec(w.rest);
  if (m) w.rest = `${w.rest.slice(0, m.index)} ${w.rest.slice(m.index + m[0].length)}`;
  return m;
};

const takeAll = (w: Working, re: RegExp) => { while (take(w, re)); };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.slice(0, 3)) && m.startsWith(s));
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;

/** Date filters for a phrase in the question, or null if there is none. */
function dateFilters(w: Working, field: string, now: Date): Filter[] | null {
  const today = tzYmd(now);
  const [Y, M] = today.split("-").map(Number) as [number, number];
  const range = (from: string, to: string): Filter[] => [{ field, op: "gte", value: from }, { field, op: "lt", value: to }];
  let m: RegExpMatchArray | null;
  if ((m = take(w, /\bday after tomorrow\b/))) return range(addDays(today, 2), addDays(today, 3));
  if ((m = take(w, /\byesterday\b/))) return range(addDays(today, -1), today);
  if ((m = take(w, /\btomorrow\b/))) return range(addDays(today, 1), addDays(today, 2));
  if ((m = take(w, /\btoday\b/))) return range(today, addDays(today, 1));
  if ((m = take(w, /\bthis week\b/))) { const s = weekStart(today); return range(s, addDays(s, 7)); }
  if ((m = take(w, /\blast week\b/))) { const s = weekStart(today); return range(addDays(s, -7), s); }
  if ((m = take(w, /\bthis month\b/))) return range(ym(Y, M - 1), M === 12 ? ym(Y + 1, 0) : ym(Y, M));
  if ((m = take(w, /\blast month\b/))) return range(M === 1 ? ym(Y - 1, 11) : ym(Y, M - 2), ym(Y, M - 1));
  if ((m = take(w, /\bthis year\b/))) return range(`${Y}-01-01`, `${Y + 1}-01-01`);
  if ((m = take(w, /\blast year\b/))) return range(`${Y - 1}-01-01`, `${Y}-01-01`);
  if ((m = take(w, /\b(?:in the )?(?:last|past) (\d{1,3}) days?\b/))) return [{ field, op: "gte", value: `${m[1]}_days_ago` }];
  if ((m = take(w, /\b(?:in the )?next (\d{1,3}) days?\b/))) return range(today, addDays(today, Number(m[1])));
  if ((m = take(w, /\bin (january|february|march|april|may|june|july|august|september|october|november|december)(?: (\d{4}))?\b/))) {
    const mi = monthIndex(m[1]!);
    const y = m[2] ? Number(m[2]) : mi + 1 > M ? Y - 1 : Y;
    return range(ym(y, mi), mi === 11 ? ym(y + 1, 0) : ym(y, mi + 1));
  }
  if ((m = take(w, /\b(?:since|from|after) (\d{4}-\d{2}-\d{2})\b/))) return [{ field, op: "gte", value: m[1]! }];
  if ((m = take(w, /\b(?:before|until|up to) (\d{4}-\d{2}-\d{2})\b/))) return [{ field, op: "lt", value: m[1]! }];
  if ((m = take(w, /\bon (\d{4}-\d{2}-\d{2})\b/))) return [{ field, op: "eq", value: m[1]! }];
  return null;
}

/** Natural-language words for each enum value of a field. */
function enumPhrases(f: { values?: string[]; aliases?: Record<string, string> }): { phrase: string; value: string }[] {
  const out: { phrase: string; value: string }[] = [];
  for (const v of f.values ?? []) out.push({ phrase: v.toLowerCase().replace(/_/g, " "), value: v });
  for (const [a, v] of Object.entries(f.aliases ?? {})) out.push({ phrase: a.toLowerCase().replace(/_/g, " "), value: v });
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
}

type Parsed = { entity: string; filters: Filter[]; mode: "count" | "list" | "group" | "sum" | "avg"; agg?: "sum" | "avg"; groupBy?: string; bucket?: DataQuery["bucket"]; metricField?: string; limit?: number; /** filters implied by the record word itself (“customers” → type = customer) */ implied: number; understood: string[] };

function parse(user: CurrentUser, question: string, ctx: Ctx, now: Date): Parsed | { refuse: string } | null {
  const q = norm(question);
  const w: Working = { rest: ` ${q} ` };
  const wantsCount = COUNT.test(q);
  const wantsTotal = TOTAL.test(q);
  const wantsAvg = AVERAGE.test(q);
  const wantsList = LIST.test(q) && !wantsCount;
  const wantsBy = BY.test(q);
  if (!wantsCount && !wantsTotal && !wantsAvg && !wantsList && !wantsBy) return null;

  // 1. which records
  let entity: string | null = null;
  const filters: Filter[] = [];
  let first = Infinity;
  for (const e of ENTITY_WORDS) {
    const m = e.re.exec(w.rest);
    if (m && m.index < first) { first = m.index; entity = e.entity; }
  }
  if (!entity) return null;
  const hit = ENTITY_WORDS.find((e) => e.entity === entity && e.re.exec(w.rest)?.index === first)!;
  take(w, hit.re);
  if (hit.filters) filters.push(...hit.filters);
  for (const e of ENTITY_WORDS) if (e.entity === entity && e !== hit) take(w, e.re); // “customer contacts”, “stock orders” seen twice
  const implied = filters.length;
  if (entity === "orders?") {
    if (isCentral(user)) entity = "stock_orders";
    else return { refuse: "“orders” could mean your **stock orders** with YADEA or your **customer orders** — say which one." };
  }
  const ent = ENTITIES[entity]!;
  const understood: string[] = [];
  const has = (name: string) => !!ent.fields[name];
  // a lead's email is its contact's email; a test drive's phone is its customer's phone
  const resolve = (name: string) => [name, `contact_${name}`, `customer_${name}`].find(has);
  const enumFieldNames = Object.entries(ent.fields).filter(([, f]) => f.type === "enum").map(([k]) => k);

  // 2. entity-specific phrases
  const add = (f: Filter) => { if (has(f.field)) filters.push(f); };
  const phrase = (re: RegExp) => !!take(w, re);
  const now0 = "now";
  switch (entity) {
    case "tasks":
      if (phrase(/\boverdue\b/)) filters.push({ field: "status", op: "in", value: ["OPEN", "IN_PROGRESS"] }, { field: "due_at", op: "lt", value: now0 });
      if (phrase(/\b(pending|open|outstanding|incomplete|unfinished)\b/)) filters.push({ field: "status", op: "in", value: ["OPEN", "IN_PROGRESS"] });
      if (phrase(/\b(done|finished|completed)\b/)) filters.push({ field: "status", op: "eq", value: "COMPLETED" });
      break;
    case "stock_orders":
      if (phrase(/\boverdue\b|\blate\b|\bdelayed\b/)) filters.push({ field: "status", op: "eq", value: "APPROVED" }, { field: "expected_delivery_date", op: "lt", value: "today" });
      if (phrase(/\b(waiting|awaiting|pending|new|received)( for)?( a)?( decision| approval)?\b/)) filters.push({ field: "status", op: "eq", value: "SUBMITTED" });
      if (phrase(/\bin progress\b|\bon the way\b/)) filters.push({ field: "status", op: "eq", value: "APPROVED" }, { field: "dispatch_status", op: "neq", value: "DELIVERED" });
      if (phrase(/\burgent\b/)) filters.push({ field: "priority", op: "eq", value: "URGENT" });
      break;
    case "ledger":
      if (phrase(/\b(awaiting|pending|unverified|not verified)( verification)?\b/)) filters.push({ field: "status", op: "eq", value: "PENDING_VERIFICATION" });
      break;
    case "leads":
      if (phrase(/\bcompany( assigned)?\b/)) add({ field: "origin", op: "eq", value: "COMPANY" });
      if (phrase(/\bwalk ?in\b/)) add({ field: "origin", op: "eq", value: "DEALERSHIP_WALK_IN" });
      if (phrase(/\bunassigned\b|\bnot assigned\b/)) add({ field: "dealership", op: "is_null" });
      else if (phrase(/\bassigned\b(?! to\b)/)) add({ field: "dealership", op: "not_null" });
      if (phrase(/\b(won|converted|closed won)\b/)) add({ field: "stage_kind", op: "eq", value: "WON" });
      if (phrase(/\blost\b/)) add({ field: "stage_kind", op: "eq", value: "LOST" });
      if (phrase(/\bopen\b|\bactive\b/)) add({ field: "stage_kind", op: "eq", value: "OPEN" });
      if (phrase(/\b(follow ?up(s)? )?(due|overdue)\b/)) add({ field: "next_follow_up_at", op: "lte", value: "now" });
      if (phrase(/\b(never|not yet) contacted\b/)) add({ field: "first_contacted_at", op: "is_null" });
      break;
    case "contacts":
      if (phrase(/\bcompany( assigned)?\b/)) add({ field: "lead_origin", op: "eq", value: "COMPANY" });
      if (phrase(/\bwalk ?in\b/)) add({ field: "lead_origin", op: "eq", value: "DEALERSHIP_WALK_IN" });
      if (phrase(/\bunassigned\b|\bnot assigned\b/)) add({ field: "dealership", op: "is_null" });
      else if (phrase(/\bassigned\b(?! to\b)/)) add({ field: "dealership", op: "not_null" });
      if (phrase(/\b(opted in|with consent|gave consent|consented)\b/)) add({ field: "marketing_consent", op: "is_true" });
      break;
    case "test_drives":
      if (phrase(/\bupcoming\b|\bscheduled\b/)) filters.push({ field: "scheduled_at", op: "gte", value: "now" }, { field: "status", op: "in", value: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] });
      break;
    case "dealerships":
      if (phrase(/\b(not|aren t|arent) (accepting|receiving)( any)?( new)?( leads)?\b/)) add({ field: "accepts_leads", op: "is_false" });
      else if (phrase(/\b(accepting|receiving)( new)?( leads)?\b/)) add({ field: "accepts_leads", op: "is_true" });
      break;
    case "users":
      if (phrase(/\b(inactive|deactivated|disabled)\b/)) add({ field: "is_active", op: "is_false" });
      else if (phrase(/\bactive\b/)) add({ field: "is_active", op: "is_true" });
      break;
    case "inventory":
      if (phrase(/\bout of stock\b/)) add({ field: "quantity", op: "lte", value: 0 });
      break;
    case "bike_models":
    case "spare_parts":
      if (phrase(/\b(inactive|discontinued|deactivated)\b/)) add({ field: "is_active", op: "is_false" });
      else if (phrase(/\bactive\b/)) add({ field: "is_active", op: "is_true" });
      break;
    default:
      break;
  }

  // 3. mentions of known places, stages, sources, models
  const names = (list: string[]) => [...list].sort((a, b) => b.length - a.length).filter((n) => n.length > 1);
  const mention = (list: string[], field: string, op: "eq" = "eq") => {
    if (!has(field)) return;
    for (const n of names(list)) {
      if (take(w, new RegExp(`\\b${esc(norm(n))}\\b`))) { filters.push({ field, op, value: n }); understood.push(n); return; }
    }
  };
  mention(ctx.dealerships, "dealership");
  mention(ctx.cities, "city");
  mention(ctx.stages, "stage");
  mention(ctx.sources, "source");
  mention(ctx.models, has("interested_model") ? "interested_model" : "bike_model");

  // 4. “with / without …”
  const fieldWords = Object.keys(FIELD_WORDS).sort((a, b) => b.length - a.length).map(esc).join("|");
  // a list of fields may follow: “with a phone and an email”, “without a phone or email”
  const more = `(?:(?:\\s*,\\s*|\\s+(?:and|or|plus|as well as|&)\\s+)(?:an?\\s+|any\\s+)?(?:${fieldWords}))*`;
  const fieldsIn = (text: string): string[] => [...text.matchAll(new RegExp(`\\b(${fieldWords})\\b`, "g"))].map((m) => m[1]!);
  for (const [kind, lead] of [["is_null", "(?:without|with no|with out|missing|lacking|(?:who |that |which )?(?:do not|dont|don t|doesn t|doesnt|does not) have(?: an?| any)?|have no|has no|no)(?: an?)?"], ["not_null", "(?:with|having|(?:who |that |which )?(?:have|has)|who got|that got)(?: an?| any| a valid)?"]] as const) {
    for (;;) {
      const m = take(w, new RegExp(`\\b${lead} (?:${fieldWords})${more}\\b`));
      if (!m) break;
      if (kind === "not_null" && /\s+or\s+/.test(m[0])) return { refuse: `“${m[0].trim()}” means either one — I can only combine conditions that must all hold, so ask about each separately.` };
      for (const word of fieldsIn(m[0])) {
        const name = resolve(FIELD_WORDS[word]!);
        if (!name) return { refuse: `${LABEL[entity]![1]} don't have a “${word}” field I can check.` };
        filters.push({ field: name, op: kind });
      }
    }
  }

  // 5. status-like words from the data itself (“completed”, “in transit”, “no show”)
  for (const fname of enumFieldNames) {
    if (filters.some((f) => f.field === fname)) continue;
    for (const { phrase: p, value } of enumPhrases(ent.fields[fname]!)) {
      if (p.length < 3) continue;
      if (take(w, new RegExp(`\\b${esc(p)}\\b`))) { filters.push({ field: fname, op: "eq", value }); break; }
    }
  }

  // 6. “my …”, “assigned to <name>”
  const person = ["sales_rep", "assignee", "assigned_rep", "owner"].find(has);
  if (person && take(w, /\bassigned to (nobody|no ?one|none)\b|\bnot assigned to (anyone|anybody)\b/)) filters.push({ field: person, op: "is_null" });
  if (person && take(w, /\b(my|mine|assigned to me)\b/)) filters.push({ field: person, op: "eq", value: user.name });
  const assigned = person ? /\bassigned to ([a-z ]{2,40}?)(?= (?:in|on|at|this|last|today|yesterday|with|without|who|that|since|before|from)\b|$)/.exec(w.rest) : null;
  if (assigned && person) {
    take(w, new RegExp(`\\bassigned to ${esc(assigned[1]!)}`));
    filters.push({ field: person, op: "contains", value: assigned[1]!.trim() });
  }

  // 6b. “named Ali”, “called Ali Khan” — every word must appear in the person's first or last name
  const nameField = NAME_FIELD[entity];
  const named = nameField ? /\b(?:named|called|with (?:the )?name|whose name is|name contains|name like|by the name of|name is) ([a-z]+(?: [a-z]+){0,2})/.exec(w.rest) : null;
  if (named && nameField) {
    const STOP_AT = new Set(["in", "on", "at", "with", "without", "who", "that", "which", "from", "this", "last", "today", "yesterday", "since", "before", "and", "for", "assigned", "by", "per", "have", "has", "created", "added", "registered", "email", "phone"]);
    const words: string[] = [];
    for (const word of named[1]!.split(" ")) { if (STOP_AT.has(word)) break; words.push(word); }
    if (words.length) {
      take(w, new RegExp(`\\b(?:named|called|with (?:the )?name|whose name is|name contains|name like|by the name of|name is) ${words.map(esc).join(" ")}`));
      for (const word of words) filters.push({ field: nameField, op: "contains", value: word });
    }
  }

  // 7. dates
  const dateField = DATE_FIELD[entity]!;
  const dated = dateFilters(w, dateField, now);
  if (dated) filters.push(...dated);
  take(w, /\b(created|added|registered|submitted|placed|booked|raised|received|made|logged|signed up|joined|due|scheduled|recorded)\b/);

  // 8. what to compute
  let mode: Parsed["mode"] = wantsList && !wantsBy ? "list" : "count";
  let groupBy: string | undefined;
  let bucket: DataQuery["bucket"];
  let metricField: string | undefined;
  let agg: Parsed["agg"];
  if (wantsBy) {
    const by = new RegExp(`\\b(?:by|per|each|for each|breakdown by|split by|grouped by|group by|across)(?: the)? (${fieldWords}|month|week|day|year|status|stage|city|source)\\b`).exec(w.rest);
    if (by) {
      take(w, new RegExp(`\\b(?:by|per|each|for each|breakdown by|split by|grouped by|group by|across)(?: the)? ${esc(by[1]!)}\\b`));
      const word = by[1]!;
      if (["month", "week", "day", "year"].includes(word)) { groupBy = dateField; bucket = word as DataQuery["bucket"]; }
      else groupBy = FIELD_WORDS[word] ?? word;
      if (!has(groupBy)) return { refuse: `I can't break ${LABEL[entity]![1]} down by “${word}”.` };
      mode = "group";
    }
  }
  const money = (names: string[]) => names.find(has);
  if (wantsTotal || wantsAvg) {
    metricField = ({ stock_orders: "subtotal", customer_orders: "total", leads: "conversion_value", vouchers: "amount", ledger: wantsTotal && /\bpaid|payments?\b/.test(q) ? "credit" : "debit" } as Record<string, string>)[entity];
    metricField ??= money(["amount", "total", "price"]);
    if (!metricField) return { refuse: `I don't have an amount to total for ${LABEL[entity]![1]}.` };
    takeAll(w, /\b(total|sum|average|avg|mean|value|values|amount|amounts|sales|revenue|invoiced|paid|collected|spend|spent|cost|worth|altogether|overall)\b/);
    mode = groupBy ? "group" : wantsAvg ? "avg" : "sum";
    agg = wantsAvg ? "avg" : "sum";
  }
  const top = /\b(?:top|first|latest|last|newest|oldest|recent) (\d{1,2})\b/.exec(w.rest);
  if (top) { take(w, /\b(?:top|first|latest|last|newest|oldest|recent) \d{1,2}\b/); }

  // 9. everything must have been understood
  const leftover = w.rest.split(" ").filter((x) => x.length > 1 && !HARMLESS.has(x) && !/^\d+$/.test(x));
  if (leftover.length) {
    return { refuse: `I understood this as a question about **${LABEL[entity]![1]}**, but I couldn't work out how to apply “${leftover.join(" ")}”. I'd rather not guess a number that quietly ignores it.` };
  }
  return { entity, filters, mode, agg, groupBy, bucket, metricField, limit: top ? Number(top[1]) : undefined, implied, understood };
}

// ───────── Answering ─────────

/** How the app writes a record's number: PO-12 for a stock order, SO-12 for a customer order, EV-12 for a voucher. */
const NUMBER_PREFIX: Record<string, string> = { stock_orders: "PO-", customer_orders: "SO-", vouchers: "EV-" };
const MONEY = /price|total|subtotal|amount|debit|credit|value|discount|tax/;
const METRIC_NAME: Record<string, string> = { debit: "invoiced (debit)", credit: "paid (credit)", subtotal: "order value (subtotal)", conversion_value: "sales value", tax_amount: "tax" };
const metricName = (f: string) => METRIC_NAME[f] ?? f.replace(/_/g, " ");
const pretty_enum = (v: string) => { const t = v.replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const pretty = (n: number, field?: string | null) => (field && MONEY.test(field) ? fmtMoney(n) : n.toLocaleString("en-US"));
const plural = (entity: string, n: number) => LABEL[entity]![n === 1 ? 0 : 1];

function format(user: CurrentUser, entity: string, p: Parsed, r: DataResult, linkFor: (path: string) => string): string {
  const where = r.filters.length ? `\n_Filters: ${r.filters.join(" · ")}_` : "";
  const note = r.note ? `\n_${r.note}_` : "";
  const link = linkFor(PAGE[entity]![user.scope === "DEALERSHIP" ? 1 : 0]);
  const open = link ? `\n${link}` : "";
  if (p.mode === "group" && r.groups) {
    if (!r.groups.length) return `**No ${LABEL[entity]![1]} match.**${where}${open}`;
    const what = p.metricField ? `${r.metric?.kind === "avg" ? "Average" : "Total"} ${metricName(p.metricField)}` : `Number of ${LABEL[entity]![1]}`;
    return `**${what}, by ${p.groupBy?.replace(/_/g, " ")}${p.bucket ? ` (${p.bucket})` : ""}** — ${r.matching.toLocaleString("en-US")} ${plural(entity, r.matching)} in all\n${r.groups.map((g) => `- ${g.key}: **${pretty(g.value, p.metricField)}**`).join("\n")}${r.groups_note ? `\n_${r.groups_note}_` : ""}${where}${note}${open}`;
  }
  if (p.mode === "sum" || p.mode === "avg") {
    const v = r.metric?.value;
    return `**${p.mode === "avg" ? "Average" : "Total"} ${metricName(p.metricField!)}: ${pretty(typeof v === "number" ? v : 0, p.metricField)}** across ${r.matching.toLocaleString("en-US")} ${plural(entity, r.matching)}${where}${note}${open}`;
  }
  if (p.mode === "list" && r.rows) {
    if (!r.rows.length) return `**No ${LABEL[entity]![1]} match.**${where}${open}`;
    const lines = r.rows.map((row) => {
      const { link: l, ...cols } = row as Record<string, unknown>;
      const shown = Object.entries(cols).filter(([, v]) => v !== null && v !== undefined && v !== "");
      // a record's number reads as “#12”; the first other column is its headline
      const label = (k: string, v: unknown) => {
        if (k === "number") return `${NUMBER_PREFIX[entity] ?? "#"}${String(v)}`;
        if (typeof v === "number") return MONEY.test(k) ? fmtMoney(v) : v.toLocaleString("en-US");
        if (typeof v === "string" && /^[A-Z][A-Z_]+$/.test(v)) return entity === "stock_orders" && k === "status" && v === "SUBMITTED" ? "Received" : pretty_enum(v);
        return String(v);
      };
      const headline = shown.find(([k]) => k !== "number") ?? shown[0];
      const vals = shown.filter((e) => e !== headline).map(([k, v]) => label(k, v));
      const text = [headline ? `**${label(headline[0], headline[1])}**` : "—", ...vals].join(" · ");
      return `- ${typeof l === "string" ? `[${text}](${l})` : text}`;
    });
    return `**${r.matching.toLocaleString("en-US")} ${plural(entity, r.matching)}**${r.matching > r.rows.length ? ` — showing ${r.rows.length}` : ""}\n${lines.join("\n")}${where}${open}`;
  }
  return `**${r.matching.toLocaleString("en-US")} ${plural(entity, r.matching)}**${r.filters.length ? "" : " in total"}${where}${open}`;
}

// ───────── “Give me Adeel Qureshi's phone number” ─────────

const ATTR = "(contact number|contact details|contact info|contact|phone number|phone|mobile number|mobile|cell number|cell|number|email address|email|e mail|city|details|info|information|profile|record|stage|dealership)";
const LEAD_IN = "(?:(?:can you |could you |please )?(?:give|show|get|tell|send) me|show|get|find|look ?up|search|what is|what are|whats|i need|i want|need)?";
const PERSON_A = new RegExp(`^${LEAD_IN}\\s*(?:the )?${ATTR} (?:of|for) (?:the )?(?:contact |customer |lead )?([a-z]+(?: [a-z]+){0,3})$`);
const PERSON_B = new RegExp(`^${LEAD_IN}\\s*(?:the )?(?:contact |customer |lead )?([a-z]+(?: [a-z]+){0,3}?) ${ATTR}$`);
/** Words that are never part of a person's name — keeps “my phone number” or “stock details” from being treated as a person. */
const NOT_A_NAME = new Set(("my your our the a an his her their this that these those new all any each every what which how who where when why can do does is are i me we you it its phone email number contact details info information profile " +
  "customer customers lead leads contacts dealer dealers dealership dealerships test drive stock order orders user users support help office head company yadea sales service the in on of for to and or with").split(" "));

/**
 * “Phone number of Ali Khan”, “Ali Khan's email”, “give me adeel qureshi contact number”: finds the contacts the user may
 * see whose name contains every word given, and shows their details. Returns null if the question isn't of that shape.
 */
export async function answerPersonQuestion(user: CurrentUser, question: string, linkFor: (path: string) => string): Promise<NlOutcome> {
  const q = norm(question.replace(/['’]s\b/gi, ""));
  // “phone number of Ali” captures (attribute, name); “Ali's phone number” captures (name, attribute)
  const a = PERSON_A.exec(q);
  const b = a ? null : PERSON_B.exec(q);
  if (!a && !b) return null;
  const name = (a ? a[2] : b![1])!.trim();
  const attr = (a ? a[1] : b![2])!;
  const words = name.split(" ").filter(Boolean);
  if (!words.length || words.some((w) => NOT_A_NAME.has(w) || w.length < 2)) return null;
  const entity = ENTITIES.contacts!;
  if (!entity.access(user)) return null;
  let result: DataResult;
  try {
    result = await runDataQuery(user, {
      entity: "contacts", show_rows: true, limit: 5,
      filters: words.map((w) => ({ field: "name", op: "contains" as const, value: w })),
      columns: ["first_name", "last_name", "type", "phone", "email", "city", "stage", "dealership", "sales_rep"],
    });
  } catch (e) {
    if (e instanceof AppError) return { kind: "refuse", text: e.message };
    throw e;
  }
  const where = linkFor(PAGE.contacts![user.scope === "DEALERSHIP" ? 1 : 0]);
  if (!result.rows?.length) return { kind: "answer", qualified: true, text: `I couldn't find a contact named “${name}” among the contacts you're allowed to see.${where ? `\n${where}` : ""}` };
  const want = /phone|number|mobile|cell/.test(attr) ? "phone" : /email|e mail/.test(attr) ? "email" : null;
  const blocks = result.rows.map((r) => {
    const full = [r.first_name, r.last_name].filter(Boolean).join(" ");
    const head = r.link ? `[**${full}**](${String(r.link)})` : `**${full}**`;
    const kind = typeof r.type === "string" ? ` — ${String(r.type).toLowerCase()}` : "";
    const lines: [string, unknown][] = [["Phone", r.phone], ["Email", r.email], ["City", r.city], ["Stage", r.stage], ["Dealership", r.dealership], ["Sales rep", r.sales_rep]];
    const wanted = lines.filter(([k]) => want && k.toLowerCase() === want);
    const rest = lines.filter(([k]) => !want || k.toLowerCase() !== want);
    const fmt = ([k, v]: [string, unknown]) => `- ${k}: ${v === null || v === undefined || v === "" ? "not recorded" : String(v)}`;
    return [`${head}${kind}`, ...wanted.map(fmt), ...rest.map(fmt)].join("\n");
  });
  const more = result.matching > result.rows.length ? `\n_Showing ${result.rows.length} of ${result.matching} matches — add more of the name to narrow it down._` : "";
  return { kind: "answer", qualified: true, text: `${blocks.join("\n\n")}${more}` };
}

async function vocabulary(user: CurrentUser): Promise<Ctx> {
  const [cities, stages, sources, dealerships, models] = await Promise.all([
    db.city.findMany({ where: { isActive: true }, select: { name: true } }),
    db.leadStage.findMany({ select: { name: true } }),
    db.leadSource.findMany({ where: { isActive: true }, select: { name: true } }),
    db.dealership.findMany({ where: isCentral(user) ? {} : { id: { in: dealershipIds(user) } }, select: { name: true } }),
    db.bikeModel.findMany({ where: { isActive: true }, select: { name: true } }),
  ]);
  const n = (rows: { name: string }[]) => rows.map((r) => r.name);
  return { cities: n(cities), stages: n(stages), sources: n(sources), dealerships: n(dealerships), models: n(models) };
}

/**
 * Tries to answer a question about the data. Returns null when the question isn't a data question at all, an `answer`
 * with the result, or a `refuse` that says exactly which part could not be applied.
 */
export async function answerDataQuestion(user: CurrentUser, question: string, linkFor: (path: string) => string, scope: "aggregate" | "list" = "aggregate", now = new Date()): Promise<NlOutcome> {
  const q = norm(question);
  // Questions about rules and limits (“how many days…”, “can I…”) are for the guide, not the data.
  if (RULE_Q.test(q)) return null;
  const aggregate = COUNT.test(q) || TOTAL.test(q) || AVERAGE.test(q) || BY.test(q);
  // Aggregate questions (counts, totals, “by city”) are answered — or refused — here. List questions are only answered
  // when fully understood, and otherwise left to the rest of the guide.
  if (scope === "aggregate" && !aggregate) return null;
  const parsed = parse(user, question, await vocabulary(user), now);
  if (!parsed) return null;
  if ("refuse" in parsed && scope === "list") return null;
  if ("refuse" in parsed) return { kind: "refuse", text: `${parsed.refuse}\nIn built-in guide mode I can filter by: status and type words, city, dealership, stage, source, bike model, having or lacking an email/phone/etc., “assigned to …”, and dates (today, this week, last 7 days, in October…). Rephrase it that way — or connect the AI key for open-ended questions.` };

  const entity = ENTITIES[parsed.entity] ?? entityFor(parsed.entity)!;
  const query: DataQuery = {
    entity: entity.key,
    filters: parsed.filters.map((f) => ({ ...f })),
    ...(parsed.mode === "group" ? { group_by: parsed.groupBy, bucket: parsed.bucket, metric: parsed.metricField ? (parsed.agg ?? "sum") : ("count" as const), metric_field: parsed.metricField } : {}),
    ...(parsed.mode === "sum" ? { metric: "sum" as const, metric_field: parsed.metricField } : {}),
    ...(parsed.mode === "avg" ? { metric: "avg" as const, metric_field: parsed.metricField } : {}),
    ...(parsed.mode === "list" ? { show_rows: true, limit: parsed.limit ?? 10 } : {}),
  };
  try {
    const result = await runDataQuery(user, query, now);
    let text = format(user, entity.key, parsed, result, linkFor);
    // a plain “how many contacts” also says how many are leads and how many customers
    if (entity.key === "contacts" && parsed.mode === "count" && parsed.filters.length === 0) {
      const split = await runDataQuery(user, { entity: "contacts", group_by: "type" }, now);
      const of = (k: string) => (split.groups?.find((g) => g.key === k)?.value ?? 0).toLocaleString("en-US");
      text = text.replace("\n", `\n- Leads (not yet bought): ${of("LEAD")}\n- Customers: ${of("CUSTOMER")}\n`);
    }
    return { kind: "answer", text, qualified: parsed.filters.length > parsed.implied };
  } catch (e) {
    if (scope === "list") return null;
    if (e instanceof AppError) return { kind: "refuse", text: e.message };
    console.error("[assistant data question]", e);
    return { kind: "refuse", text: "That lookup failed unexpectedly — please try again." };
  }
}
