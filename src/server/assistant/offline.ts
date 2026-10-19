import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can } from "@/server/authz";
import { AppError } from "@/server/errors";
import { glossaryFor, type Term } from "./glossary";
import { SUGGESTIONS, guideFor, type Audience } from "./guide";
import { howtosFor, type HowTo } from "./howtos";
import { linkFor, pagesFor, sidebarGroups, type PageDoc, type Viewer } from "./sitemap";
import { toolsFor, type ToolDef } from "./tools";

/**
 * The built-in assistant: what answers when no AI model is connected. It still knows the whole platform — it matches the
 * question against the step-by-step recipes, the screen-by-screen map, the concept guide and the administrators' own
 * knowledge entries — and it can fetch live numbers (low stock, open orders, balances, tasks…) through the same
 * permission-checked read tools the AI uses. It never changes anything.
 */
export type OfflineAnswer = { text: string; suggestions: string[] };

export const viewerOf = (user: CurrentUser): Viewer => ({ can: (p) => can(user, p), isDealerManager: user.memberships.some((m) => m.role === "MANAGER") });
/** Other workspaces a head-office user can also reach. */
export const extraSpaces = (audience: Audience, viewer: Viewer): Audience[] => (audience === "crm" && viewer.can("procurement.view") ? ["procurement"] : []);

// ───────── Text matching ─────────

const STOP = new Set(("the a an to of and or is are was were be been do does did how what which who whom whose when where why can could should would will shall may might i me my mine we our us you your it its in on at for with by from this that these those there here about into onto please show tell give me let know want need like get make find see view open go page tab screen section menu button option feature thing things any some all not no yes ok okay just also then than so if as but too very more most much many own").split(" "));

const SYNONYMS: Record<string, string[]> = {
  stock: ["inventory"], inventory: ["stock"], pay: ["payment"], paid: ["payment"], owe: ["balance"], owed: ["balance"], dues: ["balance"], due: ["balance"],
  enquiry: ["inquiry"], inquiry: ["enquiry"], dealer: ["dealership"], outlet: ["dealership"], branch: ["dealership"], bot: ["assistant"], chatbot: ["assistant"], ai: ["assistant"],
  whatsapp: ["chat"], sms: ["chat"], spreadsheet: ["excel"], xls: ["excel"], xlsx: ["excel"], buy: ["purchase"], sell: ["sale"], sold: ["sale"],
  delete: ["remove"], cancel: ["remove"], upload: ["attach"], attach: ["upload"], receipt: ["proof"], customer: ["contact"], client: ["contact"], staff: ["user"], employee: ["user"],
};

function stem(word: string) {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
function tokens(s: string) {
  const out = new Set<string>();
  for (const w of norm(s).split(" ")) if (w.length > 1 && !STOP.has(w)) out.add(stem(w));
  return out;
}
const union = (...parts: string[]) => tokens(parts.join(" "));

// ───────── Knowledge documents ─────────

type Doc = {
  kind: "howto" | "page" | "guide" | "custom" | "term";
  id: string;
  title: string;
  titleT: Set<string>;
  aliasT: Set<string>;
  bodyT: Set<string>;
  phrases: string[];
  boost: number;
  render: () => string;
  /** The question a chip should ask to come back to this document. */
  chip: string;
};

const KIND_BOOST = { howto: 1.25, page: 1, guide: 0.9, custom: 1.7, term: 1.15 } as const;

function truncateAtSentence(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("; "));
  return `${cut.slice(0, end > max * 0.5 ? end + 1 : max).trim()} …`;
}

function linkLine(paths: string[] | undefined, allowed: PageDoc[], lead = "Open") {
  const links = [...new Set(paths ?? [])].map((p) => linkFor(p, allowed)).filter((l): l is NonNullable<typeof l> => !!l);
  return links.length ? `${lead}: ${links.map((l) => `[${l.label}](${l.path})`).join(" · ")}` : "";
}

function buildDocs(audience: Audience, viewer: Viewer, custom: { title: string; body: string; tags: string[] }[]): { docs: Doc[]; pages: PageDoc[]; vocab: Set<string> } {
  const pages = pagesFor(audience, viewer);
  const groups = sidebarGroups();
  const docs: Doc[] = [];

  for (const t of glossaryFor(audience, extraSpaces(audience, viewer))) {
    docs.push({
      kind: "term", id: `term:${t.id}`, title: t.term,
      titleT: tokens(t.term), aliasT: union(...(t.aliases ?? [])), bodyT: tokens(t.definition),
      phrases: [norm(t.term), ...(t.aliases ?? []).map(norm)], boost: KIND_BOOST.term, chip: `What does ${t.term.replace(/ \(.*\)$/, "")} mean?`,
      render: () => renderTerm(t, pages),
    });
  }
  for (const h of howtosFor(audience, viewer)) {
    docs.push({
      kind: "howto", id: `howto:${h.id}`, title: h.q,
      titleT: tokens(h.q), aliasT: union(...(h.also ?? [])), bodyT: union(h.steps.join(" "), h.tip ?? ""),
      phrases: [norm(h.q), ...(h.also ?? []).map(norm)], boost: KIND_BOOST.howto, chip: h.q,
      render: () => renderHowTo(h, pages),
    });
  }
  for (const p of pages) {
    docs.push({
      kind: "page", id: `page:${p.id}`, title: p.label,
      titleT: tokens(p.label), aliasT: union(...(p.keywords ?? []), p.group ?? ""), bodyT: union(p.summary, p.inside.join(" "), (p.actions ?? []).join(" ")),
      phrases: [norm(p.label), ...(p.keywords ?? []).map(norm)], boost: KIND_BOOST.page, chip: `What is on the ${p.label} page?`,
      render: () => renderPage(p, groups.get(p.id), pages),
    });
  }
  for (const s of guideFor(audience, extraSpaces(audience, viewer))) {
    docs.push({
      kind: "guide", id: `guide:${s.id}`, title: s.title,
      titleT: tokens(s.title), aliasT: new Set(), bodyT: tokens(s.body),
      phrases: [norm(s.title)], boost: KIND_BOOST.guide, chip: `Explain: ${s.title}`,
      render: () => `**${s.title}**\n${truncateAtSentence(s.body, 1400)}`,
    });
  }
  for (const e of custom) {
    docs.push({
      kind: "custom", id: `custom:${e.title}`, title: e.title,
      titleT: tokens(e.title), aliasT: union(...e.tags), bodyT: tokens(e.body),
      phrases: [norm(e.title), ...e.tags.map(norm)], boost: KIND_BOOST.custom, chip: e.title,
      render: () => `**${e.title}**\n${e.body}`,
    });
  }
  const vocab = new Set<string>();
  for (const d of docs) for (const set of [d.titleT, d.aliasT, d.bodyT]) for (const t of set) vocab.add(t);
  return { docs, pages, vocab };
}

function renderTerm(t: Term, pages: PageDoc[]) {
  const link = linkLine(t.go, pages, "See");
  return [`**${t.term}** — ${t.definition}`, link].filter(Boolean).join("\n");
}

function renderHowTo(h: HowTo, pages: PageDoc[]) {
  const links = linkLine(h.go, pages);
  return [`**${h.q}**`, h.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), h.tip ? `_Tip: ${h.tip}_` : "", links].filter(Boolean).join("\n");
}

function renderPage(p: PageDoc, group: string | undefined, pages: PageDoc[]) {
  const where = p.sidebar === false ? "" : group ? `In the sidebar: **${group}** → **${p.label}**.` : `In the sidebar: **${p.label}**.`;
  const inside = p.inside.map((i) => `- ${i}`).join("\n");
  const actions = p.actions?.length ? `**You can:**\n${p.actions.map((a) => `- ${a}`).join("\n")}` : "";
  const link = linkLine([p.path], pages);
  return [`**${p.label}** — ${p.summary}`, where, `**What's on it:**\n${inside}`, actions, link].filter(Boolean).join("\n");
}

// ───────── Scoring ─────────

type Scored = { doc: Doc; score: number; coverage: number };

/** Optimal-string-alignment distance (a swapped pair of letters counts as one slip); gives up early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** A word the guide has never seen (“inventroy”, “ledgr”) becomes the closest word it knows, if one is a slip or two away. */
function correct(token: string, vocab: Set<string>) {
  if (vocab.has(token) || token.length < 5) return token;
  const max = token.length >= 8 ? 2 : 1;
  let best = token;
  let bestD = max + 1;
  for (const v of vocab) {
    if (v.length < 4) continue;
    const d = editDistance(token, v, max);
    if (d < bestD) { best = v; bestD = d; }
  }
  return bestD <= max ? best : token;
}

function score(docs: Doc[], question: string, vocab: Set<string>): Scored[] {
  const q = norm(question);
  const base = new Set([...tokens(question)].map((t) => correct(t, vocab)));
  if (!base.size) return [];
  // synonyms count for less than the words the user actually typed
  const weights = new Map<string, number>();
  for (const t of base) weights.set(t, 1);
  for (const raw of q.split(" ")) for (const syn of SYNONYMS[raw] ?? []) { const t = stem(syn); if (!weights.has(t)) weights.set(t, 0.6); }

  const asksHow = /^(how|can i|can we|is it possible|steps?|guide me)\b|\bhow (do|can|to|should|would)\b/.test(q);
  const asksWhere = /^(where|which (page|tab|screen|section|menu)|what (is|s) (on|in|inside)|what (does|do) .* (show|have|contain|include)|open|go to|take me|navigate|find the|tour|list)\b|\bwhere (is|are|can i find|do i find|to find)\b/.test(q);
  const asksDefine = !asksWhere && (/^(what (is|s|are|does|do)|whats|meaning of|define|explain|difference|diff)\b|\bmean(s|ing)?\b|\bdifference (between|of)\b|\bvs\b|\bversus\b/.test(q));

  const out: Scored[] = [];
  for (const doc of docs) {
    let sum = 0;
    let matched = 0;
    for (const [t, w] of weights) {
      const hit = doc.titleT.has(t) ? 6 : doc.aliasT.has(t) ? 4 : doc.bodyT.has(t) ? 1.5 : 0;
      if (hit) { sum += hit * w; if (w === 1) matched++; }
    }
    if (!sum) continue;
    const coverage = matched / base.size;
    let total = sum * (0.45 + 0.55 * coverage);
    if (doc.phrases.some((p) => p.length > 3 && (q === p || q.includes(p) || (p.length > 12 && p.includes(q) && q.length > 11 && q.includes(" "))))) total += 8;
    total *= doc.boost;
    if (doc.kind === "howto" && asksHow) total *= 1.25;
    if (doc.kind === "term" && asksHow) total *= 0.7;
    if (doc.kind === "term" && asksDefine) total *= 1.4;
    if (doc.kind === "page" && asksWhere) total *= 1.5;
    if (doc.kind === "howto" && asksWhere) total *= 0.9;
    out.push({ doc, score: total, coverage });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ───────── Live data (read tools) ─────────

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const text = (v: unknown, fallback = "—") => (v === null || v === undefined || v === "" ? fallback : String(v));
const bullet = (parts: (string | null | undefined | false)[]) => `- ${parts.filter(Boolean).join(" · ")}`;

async function runRead(user: CurrentUser, tool: ToolDef, input: unknown): Promise<unknown> {
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) throw new AppError("I couldn't make sense of that request.");
  return tool.run!(user, parsed.data as never);
}

type Live = {
  name: string;
  tool: string;
  test: (q: string, user: CurrentUser) => boolean;
  input: (q: string, ctx: { dealerships: string[]; cities: string[] }) => Record<string, unknown>;
  format: (data: unknown, ctx: { user: CurrentUser; central: boolean; pages: PageDoc[]; q: string }) => string;
};

const named = (q: string, names: string[]) => names.find((n) => q.includes(norm(n)));
const open = (path: string, ctx: { pages: PageDoc[] }) => linkLine([path], ctx.pages);
const orderSpace = (central: boolean) => (central ? "/procurement/orders" : "/portal/stock-orders");

const LIVE: Live[] = [
  {
    name: "low stock", tool: "inventory_status",
    test: (q) => /(low|out of|running out|run out|short|reorder|re order|restock|replenish).{0,25}(stock|inventory|items?|parts?|bikes?)|(stock|inventory|items?|parts?|bikes?).{0,25}(low|out of stock|running out|run out|short|reorder|replenish)|what (do|should) (i|we) (need to )?(order|restock|reorder)/.test(q),
    input: (q, c) => ({ low_only: true, ...(named(q, c.dealerships) ? { dealership: named(q, c.dealerships) } : {}) }),
    format: (data, c) => {
      const central = c.central;
      const list = central ? rows(data) : rows((data as Row).items);
      const link = central ? open("/procurement/stock", c) : open("/portal/inventory", c);
      if (!list.length) return `**Nothing is low or out of stock right now.** ✅\n${link}`;
      const lines = list.map((r) => central
        ? bullet([text(r.dealership), `**${text(r.item)}**`, `${text(r.in_stock)} left (reorder at ${text(r.reorder_level)})`])
        : bullet([`**${text(r.item)}** (${text(r.type)})`, `${text(r.in_stock)} in stock`, `reorder at ${text(r.reorder_level)}`, text(r.status)]));
      return `**Low or out-of-stock items${central ? "" : ` — ${text((data as Row).dealership)}`}** (${list.length})\n${lines.join("\n")}\n${link}`;
    },
  },
  {
    name: "stock count", tool: "inventory_status",
    test: (q) => /^how many [a-z0-9 .-]{2,40} (do (i|we) have|are (there|in stock|left|available|in the showroom)|in stock|left|available)/.test(q) && !/leads?|contacts?|tasks?|orders?|users?|dealerships?|dealers?|customers?|test drives?/.test(q),
    input: (q) => ({ search: (q.match(/^how many ([a-z0-9 .-]{2,40}?) (?:do (?:i|we) have|are (?:there|in stock|left|available|in the showroom)|in stock|left|available)/)?.[1] ?? "").replace(/\b(bikes?|spare parts?|parts?|units?)\b/g, "").trim() || undefined }),
    format: (data, c) => {
      const central = c.central;
      const list = central ? rows(data) : rows((data as Row).items);
      const link = central ? open("/procurement/stock", c) : open("/portal/inventory", c);
      if (!list.length) return `I couldn't find a stocked item matching that.\n${link}`;
      return `**Stock**\n${list.map((r) => (central ? bullet([text(r.dealership), `**${text(r.item)}**`, `${text(r.in_stock)} in stock`]) : bullet([`**${text(r.item)}**`, `${text(r.in_stock)} in stock`, `reorder at ${text(r.reorder_level)}`, text(r.status)]))).join("\n")}\n${link}`;
    },
  },
  {
    name: "stock orders", tool: "list_stock_orders",
    test: (q) => !/customer order|sales order/.test(q) && /(stock orders?|orders? ((are|is|that are) )?(waiting|awaiting|pending|need|to (approve|decide|review|dispatch|deliver)|for (a )?decision|received|in progress|open|placed)|(open|pending|latest|recent|my|current|all|placed) orders?|overdue (deliver|order|shipment)|(deliver|shipment|dispatch)\w*.{0,20}(overdue|late|pending|due)|delayed (order|deliver)|purchase orders? (to|from) yadea|deliveries? (overdue|late)|late deliver|(when|how long).{0,30}(deliver|arriv|coming|reach)|where is my (order|delivery|shipment|stock)|expected delivery|delivery (date|status)|track(ing)? (my )?(order|delivery|shipment))/.test(q),
    input: (q) => ({
      ...(/overdue|late|delayed/.test(q) ? { overdue: true } : /(waiting|awaiting|decision|approve|review|received|new)/.test(q) ? { status: "SUBMITTED" } : /deliver(ed)\b/.test(q) ? { status: "DELIVERED" } : /rejected/.test(q) ? { status: "REJECTED" } : /cancel/.test(q) ? { status: "CANCELLED" } : /(approved|in progress|dispatch|transit|on the way)/.test(q) ? { status: "APPROVED" } : {}),
      limit: 12,
    }),
    format: (data, c) => {
      const d = data as { totals: Row; orders: Row[] };
      const t = d.totals;
      const list = d.orders;
      const head = `**Stock orders** — ${text(t.placed, "0")} placed · ${text(t.awaiting_approval, "0")} awaiting approval · ${text(t.approved_in_progress, "0")} in progress · ${text(t.delivered, "0")} delivered · ${text(t.rejected, "0")} rejected · ${text(t.overdue_deliveries, "0")} overdue`;
      if (!list.length) return `${head}\nNo orders match that.\n${open(orderSpace(c.central), c)}`;
      const lines = list.map((o) => bullet([`**${text(o.order)}**`, c.central ? text(o.dealership) : null, `${text(o.status)}${o.dispatch && o.dispatch !== "NOT_DISPATCHED" ? ` (${String(o.dispatch).toLowerCase().replace(/_/g, " ")})` : ""}`, `expected ${text(o.expected_delivery, "not set")}`, text(o.value), text(o.items)]));
      return `${head}\n${lines.join("\n")}\n${open(orderSpace(c.central), c)}`;
    },
  },
  {
    name: "balance", tool: "ledger_summary",
    test: (q) => !/download|export|excel|pdf|statement/.test(q) && /(balance|owe|owed|outstanding|payable|receivable|how much (do )?(i|we) (owe|pay)|account with yadea|ledger summary|who owes|highest balance|amount due|dues\b)/.test(q),
    input: (q, c) => (named(q, c.dealerships) ? { dealership: named(q, c.dealerships) } : {}),
    format: (data, c) => {
      const link = open(c.central ? "/procurement/ledger" : "/portal/ledger", c);
      if (Array.isArray(data)) {
        const list = rows(data);
        if (!list.length) return `No balances to show.\n${link}`;
        return `**Dealer balances owed to YADEA (highest first)**\n${list.map((r) => bullet([`**${text(r.dealership)}**`, `owes ${text(r.balance_owed)}`, `${text(r.awaiting_verification)} awaiting verification`])).join("\n")}\n${link}`;
      }
      const b = data as Row;
      return `**${text(b.dealership)} — account with YADEA**\n- Balance owed: **${text(b.balance_owed)}**\n- Total invoiced: ${text(b.invoiced)}\n- Paid and verified: ${text(b.paid_and_verified)}\n- Awaiting verification: ${text(b.awaiting_verification)} (${text(b.payments_awaiting_verification, "0")} payment${Number(b.payments_awaiting_verification) === 1 ? "" : "s"})\n_Balance = posted invoices − verified payments; a payment doesn't count until YADEA accounts verifies its proof._\n${link}`;
    },
  },
  {
    name: "tasks", tool: "my_tasks",
    test: (q) => /(overdue|pending|open|today|due|my|upcoming).{0,20}(tasks?|follow ?ups?|to ?dos?)|(tasks?|follow ?ups?).{0,20}(overdue|due|today|pending|open)|how many (tasks?|follow ?ups?|to ?dos?)/.test(q),
    input: (q) => ({ filter: /overdue|late|missed/.test(q) ? "overdue" : /all tasks|everything/.test(q) ? "all" : "open", limit: 12 }),
    format: (data, c) => {
      const list = rows(data);
      const link = open(c.user.scope === "DEALERSHIP" ? "/portal/tasks" : "/crm/tasks", c);
      if (!list.length) return `**No matching tasks** 🎉\n${link}`;
      return `**Tasks (${list.length})**\n${list.map((t) => bullet([`**${text(t.title)}**`, `due ${text(t.due)}${t.overdue ? " ⚠ overdue" : ""}`, `${text(t.priority).toLowerCase()} priority`, t.contact ? `for ${text(t.contact)}` : null, `assigned to ${text(t.assigned_to)}`])).join("\n")}\n${link}`;
    },
  },
  {
    name: "test drives", tool: "list_test_drives",
    test: (q) => /(upcoming|scheduled|today|next|booked|this week|my|tomorrow).{0,20}test ?drives?|test ?drives?.{0,20}(upcoming|scheduled|today|this week|booked|tomorrow|next)/.test(q),
    input: () => ({ when: "upcoming", limit: 12 }),
    format: (data, c) => {
      const list = rows(data);
      const link = open(c.user.scope === "DEALERSHIP" ? "/portal/test-drives" : "/crm/test-drives", c);
      if (!list.length) return `**No upcoming test drives.**\n${link}`;
      return `**Upcoming test drives (${list.length})**\n${list.map((t) => bullet([`**${text(t.when)}**`, text(t.customer), text(t.model), text(t.dealership), text(t.status).toLowerCase()])).join("\n")}\n${link}`;
    },
  },
  {
    name: "unassigned leads", tool: "list_leads",
    test: (q, u) => u.scope !== "DEALERSHIP" && /unassigned.{0,15}leads?|leads?.{0,20}(unassigned|not assigned|waiting for assignment)|(new|this week'?s).{0,10}unassigned/.test(q),
    input: () => ({ unassigned: true, limit: 15 }),
    format: (data, c) => {
      const list = rows(data);
      const link = open("/crm/contacts?assigned=no", c);
      if (!list.length) return `**No unassigned leads.** ✅\n${link}`;
      return `**Unassigned leads (${list.length} shown, newest first)**\n${list.map((l) => bullet([`[**${text(l.name)}**](/crm/contacts/${text(l.contact_id)})`, text(l.phone, ""), `stage ${text(l.stage)}`, `created ${text(l.created)}`])).join("\n")}\n${link}`;
    },
  },
  {
    name: "pipeline", tool: "pipeline_summary",
    test: (q) => /(leads? by stage|pipeline (summary|numbers|counts?|status)|how many leads (are )?(in|at)|stage (counts?|summary|breakdown)|funnel numbers)/.test(q),
    input: () => ({}),
    format: (data, c) => {
      const list = rows(data);
      return `**Leads in each pipeline stage**\n${list.map((s) => bullet([`**${text(s.stage)}**`, `${text(s.leads)} lead${Number(s.leads) === 1 ? "" : "s"}`, String(s.kind).toLowerCase() === "open" ? null : String(s.kind).toLowerCase()])).join("\n")}\n${open(c.user.scope === "DEALERSHIP" ? "/portal/pipeline" : "/crm/pipeline", c)}`;
    },
  },
  {
    name: "contact count", tool: "count_contacts",
    test: (q) => /how many (total |all |registered |active )?(contacts?|customers?|people|persons?|clients?)\b|(total|number of|count of) (number of )?(contacts?|customers?|people|clients?)|contacts? (count|total)|how big is (the )?(contact|customer)/.test(q),
    input: (q, c) => {
      const city = c.cities.find((n) => q.includes(norm(n)));
      const dealership = named(q, c.dealerships);
      const days = q.match(/last (\d{1,3}) days?/)?.[1];
      return {
        ...(city ? { city } : {}),
        ...(dealership ? { dealership } : {}),
        ...(days ? { created_in_last_days: Number(days) } : /\btoday\b/.test(q) ? { created_in_last_days: 1 } : /this week|last week|past week/.test(q) ? { created_in_last_days: 7 } : /this month|last month|past month/.test(q) ? { created_in_last_days: 30 } : {}),
      };
    },
    format: (data, c) => {
      const d = data as { total_contacts: number; leads: number; customers: number; filters: string };
      const filtered = !d.filters.startsWith("none");
      return `**${d.total_contacts.toLocaleString("en-US")} contact${d.total_contacts === 1 ? "" : "s"}**${filtered ? ` (${d.filters})` : " in total"}\n- Leads (not yet bought): ${d.leads.toLocaleString("en-US")}\n- Customers: ${d.customers.toLocaleString("en-US")}\n_Counts active contacts you're allowed to see; archived contacts aren't included._\n${open(c.user.scope === "DEALERSHIP" ? "/portal/contacts" : "/crm/contacts", c)}`;
    },
  },
  {
    name: "headline numbers", tool: "dashboard_stats",
    test: (q) => /(summary|snapshot|headline|kpis?|numbers|stats|statistics|how (am|are) (i|we) doing|how many (open )?leads|what'?s (new|happening|going on))/.test(q),
    input: () => ({}),
    format: (data, c) => {
      const labels: Record<string, string> = { open_leads: "Open leads", unassigned_open_leads: "Unassigned open leads", new_leads_last_7_days: "New leads in the last 7 days", converted_this_month: "Converted this month", upcoming_test_drives: "Upcoming test drives", overdue_tasks: "Overdue tasks", stock_orders_awaiting_decision: "Stock orders awaiting a decision" };
      const entries = Object.entries(data as Record<string, number>);
      return `**Your numbers right now**\n${entries.map(([k, v]) => `- ${labels[k] ?? k}: **${v}**`).join("\n")}\n${open(c.user.scope === "DEALERSHIP" ? "/portal/dashboard" : c.pages.some((p) => p.id === "crm-dashboard") ? "/crm/dashboard" : "/procurement/dashboard", c)}`;
    },
  },
  {
    name: "dealerships", tool: "list_dealerships",
    test: (q, u) => u.scope !== "DEALERSHIP" && /((which|list|show|all|any).{0,30}(dealerships?|dealers?|outlets?))|((dealerships?|dealers?|outlets?).{0,30}(accepting|receiving|active|in (the )?network))|how many (active |total )?(dealerships?|dealers?|outlets?)/.test(q),
    input: () => ({}),
    format: (data, c) => {
      const list = rows(data);
      const accepting = /accepting|receiving/.test(c.q);
      const shown = accepting ? list.filter((d) => d.accepts_leads) : list;
      if (!shown.length) return `No dealerships match that.\n${open("/crm/dealerships", c)}`;
      return `**${accepting ? "Dealerships accepting leads" : "Dealerships"} (${shown.length})**\n${shown.map((d) => bullet([`**${text(d.name)}** (${text(d.code)})`, text(d.city), text(d.status).toLowerCase(), d.accepts_leads ? "accepting leads" : "not accepting leads"])).join("\n")}\n${open("/crm/dealerships", c)}`;
    },
  },
  {
    name: "catalogue", tool: "search_catalog",
    test: (q) => /(price|prices|pricing|cost|how much (is|are|does)|catalogue|catalog|what (bikes|models|spare parts)|list (of )?(the )?(bike )?(models|spare parts)|spare parts (list|available))/.test(q),
    input: (q) => {
      const drop = new Set([...STOP, "price", "prices", "pricing", "cost", "catalogue", "catalog", "list", "models", "model", "bikes", "bike", "spare", "parts", "part", "retail", "dealer", "pkr", "available", "what", "much"]);
      const term = norm(q).split(" ").filter((w) => w.length > 1 && !drop.has(w)).join(" ");
      return term ? { query: term } : {};
    },
    format: (data, c) => {
      const d = data as { bike_models: Row[]; spare_parts: Row[] };
      if (!d.bike_models.length && !d.spare_parts.length) return "I couldn't find a bike model or spare part with that name in the catalogue.";
      const bikes = d.bike_models.map((m) => bullet([`**${text(m.name)}** (${text(m.code)})`, `retail ${text(m.retail_price)}`, `dealer price ${text(m.dealer_price)}`]));
      const parts = d.spare_parts.map((p) => bullet([`**${text(p.name)}** (${text(p.sku)})`, text(p.category, ""), `retail ${text(p.retail_price)}`, `dealer price ${text(p.dealer_price)}`]));
      const link = c.pages.some((p) => p.id === "proc-catalog") ? open("/procurement/catalog", c) : "";
      return `${bikes.length ? `**Bike models**\n${bikes.join("\n")}\n` : ""}${parts.length ? `**Spare parts**\n${parts.join("\n")}\n` : ""}_Prices are exactly what administrators have entered — “not set” means no price has been entered yet._\n${link}`.trim();
    },
  },
];

const CONTACT_SEARCH = /^(find|search( for)?|look ?up|lookup|get|show)( me)?( the)?( contact| customer| lead| person)?( called| named)? (.{2,60})$/;

async function liveAnswer(user: CurrentUser, q: string, pages: PageDoc[], viewerTools: ToolDef[]): Promise<{ text: string; denied?: false } | { denied: true } | null> {
  // Questions about how something works, whether something is allowed or what a word means are answered from the guide, not from data.
  if (/^(how (do|can|to|should|would|come)|why|what happens|what if|what does|explain|can i|can we|could i|could we|is it possible|am i (able|allowed)|should i)\b|\bhow to\b|\bmean(s|ing)?\b/.test(q)) return null;
  const ctx = { user, central: user.scope !== "DEALERSHIP", pages, q };
  const dealerships = ctx.central ? (await db.dealership.findMany({ select: { name: true } })).map((d) => d.name) : [];
  const cities = (await db.city.findMany({ where: { isActive: true }, select: { name: true } })).map((c) => c.name);
  for (const rule of LIVE) {
    if (!rule.test(q, user)) continue;
    const tool = viewerTools.find((t) => t.name === rule.tool);
    if (!tool) return { denied: true };
    try {
      const data = await runRead(user, tool, rule.input(q, { dealerships, cities }));
      return { text: rule.format(data, ctx) };
    } catch (e) {
      if (e instanceof AppError) return { text: e.message };
      console.error("[assistant offline]", rule.name, e);
      return { text: "That lookup failed unexpectedly — please try again." };
    }
  }
  return null;
}

async function contactLookup(user: CurrentUser, q: string, pages: PageDoc[], viewerTools: ToolDef[]): Promise<string | null> {
  const m = q.match(CONTACT_SEARCH);
  const tool = viewerTools.find((t) => t.name === "search_contacts");
  if (!m || !tool) return null;
  const term = m[7]!.replace(/\b(contact|customer|lead|person|please)\b/g, "").trim();
  if (term.length < 2) return null;
  try {
    const found = rows(await runRead(user, tool, { query: term, limit: 8 }));
    const base = user.scope === "DEALERSHIP" ? "/portal/contacts" : "/crm/contacts";
    if (!found.length) return `I couldn't find a contact matching “${term}”.\n${linkLine([base], pages)}`;
    return `**Contacts matching “${term}”**\n${found.map((c) => bullet([`[**${text(c.name)}**](${base}/${text(c.contact_id)})`, text(c.phone, ""), text(c.email, ""), c.stage ? `stage ${text(c.stage)}` : null, c.dealership ? text(c.dealership) : null, c.sales_rep ? `rep ${text(c.sales_rep)}` : null])).join("\n")}`;
  } catch (e) {
    if (e instanceof AppError) return e.message;
    return null;
  }
}

// ───────── Conversation basics ─────────

const GREETING = /^(hi+|hello+|hey+|hiya|salam|salaam|assalam[ -]?o[ -]?alaikum|good (morning|afternoon|evening)|greetings)\b/;
const THANKS = /\b(thanks|thank you|thx|shukriya|jazak)/;
/** A question about how many records exist (as opposed to a limit or rule like “how many files can I attach”). */
const DATA_COUNT = /^(how many|total number of|number of|count of|total)\b/;
const COUNT_LIMITS = /\b(can|could|may|must|should|allowed|limit|maximum|max|at most|attach|upload|characters|files|attempts)\b/;
const CAPABILITIES =/^(help( me)?|menu|commands|capabilities|what can you do|what do you do|who are you|what are you|how can you help( me)?|what can i ask( you)?)$|what can you (do|help)/;
const TOUR = /\b(all|every|complete|full|whole|entire|list)\b.{0,25}\b(tabs?|pages?|menus?|sections?|screens?|features?|modules?|options)\b|\b(app|system|platform|crm|portal) (overview|tour|walkthrough|guide)\b|\bwhat('?s| is| does)\b.{0,15}\b(in|inside|on|available in) (the )?(app|system|platform|crm|portal|sidebar|menu)\b|\b(a to z|a z)\b|\beverything( (in|inside|about|on))?( (the|this))?( (app|system|platform|crm|portal|sidebar|menu|application))?$|\bsite ?map\b|\bsidebar\b.{0,15}\b(items?|options|links?)\b|\bwalk me through\b/;

function capabilities(audience: Audience, central: boolean): OfflineAnswer {
  const live = central ? "how many contacts there are, low stock across dealers, orders waiting for a decision, overdue deliveries, balances owed, unassigned leads, pipeline numbers, tasks, test drives and prices" : "how many contacts you have, your low-stock items, open stock orders, balance owed to YADEA, tasks, test drives and prices";
  return {
    text: `I'm the YADEA assistant. Right now I'm running in **built-in guide mode**, and I know this whole platform. I can:\n- **Explain any screen** — what's on it, which tab or button to use, and where to find it (“What is on the Ledger page?”).\n- **Walk you through tasks step by step** (“How do I record a payment with proof?”).\n- **Show live numbers** you're allowed to see: ${live}.\n- **Give a full tour** — ask “Show me everything in the app”.\nI can't change anything in this mode; for free-form answers and proposed changes an administrator needs to connect the AI key.`,
    suggestions: SUGGESTIONS[audience].slice(0, 4),
  };
}

const WORKSPACE_NAME: Record<Audience, string> = { crm: "Central CRM", portal: "Dealer Portal", procurement: "Procurement Portal" };

function tour(pages: PageDoc[]): string {
  const groups = sidebarGroups();
  const shown = pages.filter((x) => x.sidebar !== false);
  const several = new Set(shown.map((p) => p.workspace)).size > 1;
  const out: string[] = ["**Everything you can open, in sidebar order** (items your role doesn't include aren't shown):"];
  let space: Audience | undefined;
  let current: string | undefined = "\u0000";
  for (const p of shown) {
    if (several && p.workspace !== space) { space = p.workspace; current = "\u0000"; out.push(`\n**━ ${WORKSPACE_NAME[p.workspace]} workspace ━**${p.workspace === "procurement" ? " (open it from Operations → Procurement & Accounts)" : ""}`); }
    const g = groups.get(p.id);
    if (g !== current) { current = g; out.push(g ? `\n**${g}**` : ""); }
    const link = p.path.includes("[") ? `**${p.label}**` : `[**${p.label}**](${p.path})`;
    out.push(`- ${link} — ${p.summary}`);
  }
  out.push("\nAsk me about any of these — for example “What is on the Inventory page?” or “How do I add stock?”.");
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

function noMatch(audience: Audience): OfflineAnswer {
  return {
    text: "I couldn't find that in the built-in guide. I can explain any screen, walk you through a task step by step, show live numbers you're allowed to see, or give a tour of the whole app. Try one of these, or ask an administrator to add the answer to the **Knowledge Base**.",
    suggestions: [...SUGGESTIONS[audience].slice(0, 3), "Show me everything in the app"],
  };
}

// ───────── Entry point ─────────

export async function offlineAnswer(user: CurrentUser, audience: Audience, question: string): Promise<OfflineAnswer> {
  const viewer = viewerOf(user);
  const q = norm(question);
  const central = user.scope !== "DEALERSHIP";

  if (THANKS.test(q) && q.split(" ").length <= 6) return { text: "You're welcome! Ask me anything else about the platform.", suggestions: SUGGESTIONS[audience].slice(0, 3) };
  if (GREETING.test(q) && q.split(" ").length <= 5) return { text: `Hello ${user.name.split(" ")[0]}! What would you like to know about the platform?`, suggestions: SUGGESTIONS[audience].slice(0, 4) };
  if (CAPABILITIES.test(q)) return capabilities(audience, central);

  const custom = await db.knowledgeEntry.findMany({ where: { isActive: true }, select: { title: true, body: true, tags: true } });
  const { docs, pages, vocab } = buildDocs(audience, viewer, custom);

  if (TOUR.test(q)) return { text: tour(pages), suggestions: SUGGESTIONS[audience].slice(0, 3) };

  const tools = toolsFor(user);
  const live = await liveAnswer(user, q, pages, tools);
  if (live && !("denied" in live)) return { text: live.text.trim(), suggestions: SUGGESTIONS[audience].filter((s) => norm(s) !== q).slice(0, 3) };

  // “How many X are there?” asks for a number from the data. If no lookup covers it, say so — never answer with a definition of X.
  if (DATA_COUNT.test(q) && !COUNT_LIMITS.test(q) && !(live && !("denied" in live))) {
    const where = linkLine(["/crm/dashboard", "/portal/dashboard", "/procurement/dashboard", "/crm/reports", "/portal/analytics"], pages, "Numbers are shown on");
    const msg = live && "denied" in live
      ? "Your role doesn't include live access to that information."
      : "I can't look up that particular number in built-in guide mode. I can count contacts and show low stock, stock orders, balances, tasks, test drives, dealerships and pipeline numbers; connect the AI key for anything beyond that.";
    return { text: [msg, where].filter(Boolean).join("\n"), suggestions: SUGGESTIONS[audience].slice(0, 3) };
  }

  const ranked = score(docs, question, vocab);
  const top = ranked[0];
  const confident = !!top && top.score >= 5 && top.coverage >= 0.3;

  // A bare "find <name>" is a contact search unless it clearly names a screen or topic.
  if (!confident || top.doc.kind === "guide") {
    const hit = await contactLookup(user, q, pages, tools);
    if (hit) return { text: hit, suggestions: [] };
  }
  if (!confident) {
    const base = noMatch(audience);
    return live && "denied" in live ? { ...base, text: `Your role doesn't include live access to that information. ${base.text}` } : base;
  }

  // A single word that names a screen or topic outright (“inventory”) goes straight there; one that could mean several
  // things (“orders”) gets a short menu instead of a guess.
  let best = top;
  const words = [...tokens(question)].map((t) => correct(t, vocab));
  if (words.length === 1) {
    const named = ranked.filter((r) => r.doc.phrases.some((p) => !p.includes(" ") && tokens(p).has(words[0]!)));
    if (named.length) best = named[0]!;
    else {
      const near = ranked.filter((r) => r.score >= top.score * 0.6).slice(0, 4);
      if (near.length >= 3) return { text: `“${question.trim()}” could mean a few things — tap the one you want:\n${near.map((r) => `- ${r.doc.chip}`).join("\n")}`, suggestions: near.map((r) => r.doc.chip) };
    }
  }

  const lead = live && "denied" in live ? "_Your role doesn't include live access to that data, so here's how it works instead._\n\n" : "";
  // “What's the difference between X and Y?” — show the two best-matching definitions side by side.
  const terms = ranked.filter((r) => r.doc.kind === "term");
  const compare = /difference|differ|versus|\bvs\b|compare|same as/.test(q) && terms.length >= 2 && terms[0]!.score >= best.score * 0.6 && terms[1]!.score >= terms[0]!.score * 0.5;
  const shownDocs = compare ? [terms[0]!, terms[1]!] : [best];
  const body = shownDocs.map((r) => r.doc.render()).join("\n\n");
  const related = ranked.filter((r) => !shownDocs.includes(r)).filter((r) => r.score >= Math.max(5, best.score * 0.45)).slice(0, 3).map((r) => r.doc.chip);
  return { text: (lead + body).trim(), suggestions: related };
}