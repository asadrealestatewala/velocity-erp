import "server-only";

/**
 * Built-in knowledge base: how the whole platform works. It is given to the assistant as reference material and is
 * also what the assistant falls back to (keyword search) when no AI model is connected. Audience limits what a user is
 * told about — a dealership never needs the head-office admin screens, and vice versa.
 */
export type Audience = "crm" | "portal" | "procurement";
export type GuideSection = { id: string; title: string; audience: Audience[]; body: string };

const ALL: Audience[] = ["crm", "portal", "procurement"];

export const GUIDE: GuideSection[] = [
  {
    id: "overview",
    title: "What this platform is",
    audience: ALL,
    body: `The Velocity ERP — Dealership Management Platform has three workspaces that share one database:
- **Central CRM** (/crm) for YADEA head-office staff: contacts and leads, pipeline, public forms, test drives, dealership network, dealership applications, bike models, reports, users and permissions, audit log and settings.
- **Dealer Portal** (/portal) for each dealership: its own leads, walk-ins, pipeline, test drives, tasks, team, showroom inventory, customer orders, stock orders to YADEA, account ledger, expense vouchers, documents and audit log.
- **Procurement Portal** (/procurement) for YADEA's procurement & accounts team: dealership stock orders, dispatch and delivery, product catalogue and dealer prices, dealer stock, ledgers and payment verification, expense vouchers and dealership documents/certificates.
A dealership only ever sees its own data. Anything outside a user's scope behaves as "not found".`,
  },
  {
    id: "signin",
    title: "Signing in (email or mobile number)",
    audience: ALL,
    body: `Central staff sign in at /login, dealerships at /portal/login and procurement at /procurement/login. Dealership staff can sign in with either their **email address or their mobile number** (any format, e.g. 0300 1234567 or +92 300 1234567) plus their password. Each mobile number belongs to exactly one account. Temporary passwords must be changed at first sign-in (Account page). After 8 failed attempts in 15 minutes sign-in is temporarily blocked.`,
  },
  {
    id: "roles",
    title: "Roles and permissions",
    audience: ["crm", "procurement"],
    body: `Default roles: **Super Administrator** (everything except dealership-only actions), **YADEA Management** (dashboards, reports, oversight, application review, read access to procurement/ledgers), **Sales & CRM Staff** (contacts, leads, assignment, follow-ups, messaging), **Procurement & Accounts** (stock orders, catalogue, dealer stock, ledgers, vouchers, dealership documents), **Dealership Manager** (one per outlet), **Dealerships Head** (oversees several dealerships, possibly across regions, from one portal) and **Dealership Sales Representative**. Super Administrators change what each role may do under Users & Permissions (a permission matrix). Dealership-only permissions (inventory, customer orders, stock orders, payments to YADEA, vouchers) are never granted to head-office roles — YADEA staff act on dealer data through the Procurement portal instead.`,
  },
  {
    id: "roles-dealer",
    title: "What managers and sales reps can do",
    audience: ["portal"],
    body: `**Dealership managers** run the dealership: see all its leads, assign leads to their reps, manage the team, manage inventory, place stock orders with YADEA, record payments to YADEA, create expense vouchers, upload documents and read the dealership audit log. **Sales reps** work the leads assigned to them (unless the dealership lets reps see all leads), log calls/messages, schedule test drives and follow-ups, and can view inventory and raise customer orders, but cannot change stock levels, order from YADEA, handle payments or see the audit log.`,
  },
  {
    id: "contacts",
    title: "Contacts and leads",
    audience: ALL,
    body: `A **contact** is a person; a **lead** is an enquiry from that person (a contact can have several). Create contacts manually, from public forms or as dealership walk-ins. Duplicates are detected by phone and email (formats are normalised) and are never merged silently. Each contact page has a records dock with **Activity** (timeline, filterable), **Chat** (WhatsApp/email), **Tasks**, **Notes**, **Documents** and **Payments**. Leads carry a stage, source, interested model, preferred dealership, assigned dealership and sales rep, and a next follow-up date. Central staff see every lead; dealership users only their dealership's.`,
  },
  {
    id: "pipeline",
    title: "Pipeline, stages, conversion and lost leads",
    audience: ["crm", "portal"],
    body: `Leads move through configurable stages (by default New → Contacted → Qualified → Test drive scheduled → Test drive completed → Converted / Lost). Drag cards on the Pipeline board or change the stage on the contact page. Moving to **Converted** captures the sold model and conversion value; moving to **Lost** requires a loss reason. Every change is stored in the stage history. Administrators configure stages, loss reasons and lead sources under Settings.`,
  },
  {
    id: "assignment",
    title: "Lead assignment and city routing",
    audience: ["crm", "portal"],
    body: `New leads from public forms are routed by city: a test-drive request goes to the outlet the customer selected (the outlet must be active, accept leads and offer the chosen model). Otherwise the engine picks the eligible outlet in the customer's city with the fewest open leads. Central staff with the assign permission can reassign any lead to any eligible dealership (or send it back to the unassigned queue); dealership managers can only choose the sales rep within their own dealership. Every assignment is stored with who, when and why, and the dealerships involved are notified.`,
  },
  {
    id: "forms",
    title: "Public forms and submissions",
    audience: ["crm"],
    body: `Three public forms are published: **Test drive** (/forms/test-drive), **General inquiry** (/forms/general-inquiry) and **Dealership application** (/forms/dealership-application). Administrators build and version forms under Forms (fields, conditional logic, consent). Each submission appears under Form Submissions, where staff can review it, link it to an existing contact or create a contact/lead. Duplicate and spam protection is built in.`,
  },
  {
    id: "testdrives",
    title: "Test drives",
    audience: ["crm", "portal"],
    body: `Test-drive bookings are validated against the outlet's opening hours, minimum notice, booking horizon and slot capacity. A request is never treated as confirmed until staff confirm it. Statuses: Requested → Confirmed → Completed, or Rescheduled / Cancelled / No-show. Completing a test drive advances the lead and awards points.`,
  },
  {
    id: "applications",
    title: "Dealership applications and onboarding",
    audience: ["crm"],
    body: `Applications submitted through the public form are reviewed by YADEA management: Submitted → Under review → Info required / Approved / Rejected / Withdrawn, each with reasons and history. Approval does not create anything automatically; onboarding is a checklist: verify, create the dealership (Pending), create the manager's account, configure models, activate, enable lead assignment, notify.`,
  },
  {
    id: "inventory",
    title: "Showroom inventory (bikes and spare parts)",
    audience: ["portal", "procurement"],
    body: `Every dealership keeps its own inventory under **Inventory**, split into **Bike models** (e.g. GT70, Ruibin L, Ruibin S, Keeness) and **Spare parts**. A manager adds each item with its opening quantity and a reorder level, and can add, remove or recount stock; every change is written to an append-only history (who, when, why, new quantity). Stock never goes below zero. When an item reaches its reorder level, the dealership managers get a low-stock alert. Procurement can see every dealership's stock under Dealer Stock.`,
  },
  {
    id: "vehicles",
    title: "Vehicles (chassis, owner and number plate)",
    audience: ["portal"],
    body: `**Vehicles** records each physical bike by its chassis (VIN) and engine number. It sits beside Inventory and never changes the stock count. A manager adds a unit; a salesperson then assigns it to a **confirmed** customer order, which makes the order's customer the owner and puts the bike in their vehicle history on the contact page. Once sold, a manager records the registration (Not registered → Applied → Registered) and the number plate. Cancelling the order returns the unit to stock and clears the owner and plate.`,
  },
  {
    id: "sales-orders",
    title: "Customer orders (purchase orders at the showroom)",
    audience: ["portal"],
    body: `**Customer Orders** records what a customer buys at the showroom. Pick a contact (or type a walk-in name), add bikes/spare parts that are in stock, prices and an optional discount. A **draft** does not change stock. **Confirming** the order deducts every line from the showroom inventory in one step (all or nothing — if any item lacks stock nothing is deducted). **Cancelling** a confirmed order puts the stock back. The order appears on the customer's activity timeline and can be downloaded as a PDF.`,
  },
  {
    id: "stock-orders",
    title: "Stock orders to YADEA procurement",
    audience: ["portal", "procurement"],
    body: `Dealerships order bikes and spare parts from YADEA under **Stock Orders → New stock order**. Prices come from the catalogue's dealer price when set. Flow: **Received → Approved** (procurement confirms prices and an expected delivery date, or rejects with a reason) → **Packing → Dispatched → In transit → Delivered**. An invoice is raised on the dealer's ledger when the order is dispatched. When the delivery arrives, the dealership opens the order and **confirms receipt** with the quantities that actually arrived — only then is the showroom stock increased (short deliveries are supported). A dealership can cancel an order until procurement acts on it. Procurement sees counts of orders received, approved, in progress, delivered and overdue, plus delivery dates, dispatch status, courier and tracking.`,
  },
  {
    id: "procurement-desk",
    title: "Procurement desk: approving, dispatching and delivering",
    audience: ["procurement"],
    body: `Open **Dealer Orders** or the dashboard queue. On an order: **Approve** (set each line's price, expected delivery date, internal note) or **Reject** (reason required). After approval use **Update delivery** to move it through Packing, Dispatched, In transit and Delivered, adding courier and tracking number; the dealership is notified at every step. Dispatching raises the invoice on the dealer's ledger once. Status can only move forward. The **Dispatch** page lists all open shipments, oldest expected date first, with overdue ones flagged.`,
  },
  {
    id: "catalog",
    title: "Product catalogue and dealer prices",
    audience: ["procurement", "crm"],
    body: `The Procurement department owns the whole catalogue: **bike models** and **spare parts** are both added and edited under Procurement → Product Catalogue (spare parts have SKU, name, category, retail price, dealer price, image); administrators can also manage models under CRM → Bike models. Prices are only ever what an administrator enters — the system never invents prices. Deactivating an item hides it from ordering and stocking but keeps history. Bike model dealer prices (what dealers pay YADEA) are set in the catalogue.`,
  },
  {
    id: "ledger",
    title: "Dealer account ledger and payments",
    audience: ["portal", "procurement"],
    body: `Each dealership has an account with YADEA. **Balance owed = posted invoices − verified payments.** Invoices are raised automatically when a stock order is dispatched; procurement/accounts can also post opening balances, credit notes and adjustments. A dealership records a payment under **Account Ledger → Record payment** with the amount, date, method, reference and **proof of payment** (a bank slip, transfer screenshot or signed receipt). It shows as *awaiting verification* and does **not** reduce the balance until YADEA accounts verifies it against the proof (or rejects it with a reason). The ledger can be downloaded as **Excel or PDF** for any period, with a running balance.`,
  },
  {
    id: "vouchers",
    title: "Expense vouchers and tax records",
    audience: ["portal", "procurement"],
    body: `Dealerships create **expense vouchers** (date, category, payee, amount, tax included, method, reference) and attach supporting documents of any type: **proof of payment, proof of invoice, the invoice itself, receipts**. More documents can be attached later; once a voucher is reviewed its evidence is frozen. YADEA accounts approve or reject expense vouchers (payment-to-YADEA vouchers follow the ledger verification). Vouchers export to Excel with tax amounts and the documents on file, for taxation records.`,
  },
  {
    id: "documents",
    title: "Dealership documents and achievement certificates",
    audience: ["portal", "procurement"],
    body: `Each dealership has one shared document list that both the dealership and YADEA see. The dealership uploads its **certificate of registration**, licences, tax registration and agreements (with optional expiry dates); YADEA staff can upload on its behalf. **Achievement certificates** are issued only by YADEA — the dealership is notified and can download them from its Documents page. Files are checked by content type and are only served to the dealership's authorised users and YADEA document administrators.`,
  },
  {
    id: "messaging",
    title: "Calling and WhatsApp from a contact",
    audience: ["crm", "portal"],
    body: `Next to every phone number — on the **Contacts** list and on the contact page — there are two icons. The green **WhatsApp** icon opens that number's chat in WhatsApp (WhatsApp Web or the app) in a new tab; the **phone** icon starts a call on a device that can place calls. Conversations happen in WhatsApp itself, not inside the CRM. To keep a record on the contact, use **Log interaction** (call, WhatsApp, SMS, email or meeting) — logged items appear on the activity timeline and are labelled as manually logged. Contacts who opted out of a channel should not be contacted on it.`,
  },
  {
    id: "tasks",
    title: "Tasks and follow-ups",
    audience: ["crm", "portal"],
    body: `Tasks (call, follow-up, email, test drive, meeting, other) have a due date, priority and optional reminder. Overdue follow-ups notify the assignee once. Completing a follow-up on time awards points. Central staff see all tasks; dealership users see their own (managers see the whole dealership's).`,
  },
  {
    id: "reports",
    title: "Reports, leaderboard and points",
    audience: ["crm", "portal"],
    body: `Reports & Analytics cover lead volume, conversion, response time, test drives, sources, dealership performance and recognised sales over any period. Points are awarded only for real business events (first contact, fast response, on-time follow-ups, stage advances, completed test drives, conversions) with a unique key per event so nothing is double-counted. Leaderboards rank by a normalised score; dealership users only see individual rankings within their own dealership.`,
  },
  {
    id: "audit",
    title: "Audit log",
    audience: ["crm", "portal"],
    body: `Sensitive actions are recorded with who, when and what changed: sign-ins and failures, assignments, stock changes, orders, payments, document uploads, exports, team changes and settings. **Dealership managers** can open **Audit Log** in their portal to see their own dealership's activity (YADEA head-office actions on their data appear as "YADEA team"; IP addresses are never shown to dealerships). The central Audit Log shows everything and can be filtered by dealership.`,
  },
  {
    id: "notifications",
    title: "Notifications",
    audience: ALL,
    body: `In-app notifications (bell icon) and optional emails are sent for lead assignments, test-drive bookings and reminders, follow-ups, stock-order updates, low stock, payment verification, new documents/certificates and new customer messages. Each user can switch in-app/email per type under Account. Without SMTP configured, emails are recorded as skipped — only in-app notifications are delivered.`,
  },
  {
    id: "navigation",
    title: "Finding your way around (sidebar, top bar, search)",
    audience: ALL,
    body: `The **sidebar** on the left lists every screen your role can open (on a phone tap the ☰ button to open it). At its top is your name card (click it for **Account & password** and **Sign out**) and a **search box** — press **Ctrl K** to jump to it — which finds contacts by name, phone, email or business in the CRM and dealer portal, and orders by number or dealership in procurement. The **top bar** has quick actions (the **+** button for a new contact or walk-in lead, and **Assign leads** with an unassigned count for head office), the **sparkle button** that opens this assistant, the **bell** for notifications and your **avatar** (the same Account & password / Sign out menu). If a sidebar item is missing, your role doesn't include that permission — ask a Super Administrator. List pages have a **filter bar** above the table; filters are kept in the address so you can bookmark or share a filtered view.`,
  },
  {
    id: "statuses",
    title: "Status words explained (orders, deliveries, payments, stock)",
    audience: ["portal", "procurement"],
    body: `**Stock order:** Received (placed by the dealer, waiting for procurement) → Approved (prices and expected delivery date confirmed) → Delivered; or Rejected (with a reason) / Cancelled (by the dealer before procurement acted). **Dispatch status:** Not dispatched → Packing → Dispatched → In transit → Delivered. An order is **overdue** when it is approved, not delivered and past its expected delivery date. **Customer order:** Draft (no stock change) → Confirmed (stock deducted) or Cancelled (stock returned). **Ledger entry type:** Invoice, Payment, Credit note, Adjustment; **status:** Posted, Awaiting verification (a dealer's payment not yet checked against its proof — it does not reduce the balance) or Rejected. **Voucher:** Submitted → Approved or Rejected. **Stock level:** In stock; Low stock = quantity at or below the reorder level; Out of stock = zero.`,
  },
  {
    id: "lead-terms",
    title: "Lead words explained (contact, lead, origin, source, stage)",
    audience: ["crm", "portal"],
    body: `A **contact** is a person (type Lead until they buy, then Customer). A **lead** is one inquiry; a returning customer can have several (use **New inquiry** on their page). **Origin** says who created it: *Company-assigned* (head office, website forms, social) or *Walk-in* (created by a dealership for someone who visited or called). **Source** is the channel it came from (website form, social, walk-in…) and is configured in Settings. **Stage** is where the lead is in the pipeline; **Converted** and **Lost** close it. **Assigned** means it has a dealership (and optionally a sales rep); **unassigned** leads wait in the central queue. **Follow-up due** means the next follow-up date is today or earlier.`,
  },
  {
    id: "exports",
    title: "Exports and downloads",
    audience: ALL,
    body: `**Contacts** → Export CSV (CRM, needs export permission; the current filters apply). **Account ledger** → Excel or PDF for any period (dealer portal and procurement). **Expense vouchers** → Excel with tax amounts and the documents on file (dealer portal and procurement). **Customer order** → PDF from the order page. **Stock order** → invoice from the order page. **Documents and certificates** → View or Download on the Documents page. Exports are recorded in the audit log.`,
  },
  {
    id: "uploads",
    title: "Uploading files (types and size)",
    audience: ALL,
    body: `Files are checked by their real content (not just their name or what the browser claims). Accepted: **PDF, JPG, PNG, WEBP, DOCX and XLSX** — anything else is refused, and a renamed file whose content doesn't match is refused too. The default limit is **10 MB per file**, and up to 8 files can be attached in one go to a payment or voucher (about 12 MB in total per submission — attach the rest afterwards). Uploaded files are only shown to the dealership's authorised users and to the YADEA staff whose role allows it.`,
  },
  {
    id: "demo-data",
    title: "Demo data and prices",
    audience: ALL,
    body: `This installation may contain **demo data** (the Gulberg E-Mobility demo dealership, sample customers, orders and ledger entries) so every screen has something to show. Demo amounts and prices are **not YADEA's real prices**. Prices in the catalogue are only ever what an administrator entered; the assistant never invents a price, specification or policy.`,
  },
  {
    id: "assistant",
    title: "About this assistant",
    audience: ALL,
    body: `The assistant answers questions about how the platform works, looks up live data you are allowed to see, and — if your role allows it — can **propose** changes (add a note or task, create a contact, adjust stock, place a stock order, set a part price, add a knowledge entry…). It never changes anything by itself: each proposal appears as a card showing exactly what will happen, and nothing is saved until you press **Confirm**. Confirmed changes run with your own permissions and are written to the audit log. Administrators can teach it company-specific answers under Knowledge Base.`,
  },
];

/** Topics for the audience (plus those of other workspaces the user can also reach, e.g. Procurement for head office). */
export function guideFor(audience: Audience, also: Audience[] = []) {
  const spaces = [audience, ...also];
  return GUIDE.filter((s) => s.audience.some((a) => spaces.includes(a)));
}

export const SUGGESTIONS: Record<Audience, string[]> = {
  crm: ["How do I assign a lead to a dealership?", "Show me this week's unassigned leads", "Which dealerships are accepting leads?", "What is on the Settings page?", "Show me everything in the app"],
  portal: ["Which items are low on stock?", "How do I order spare parts from YADEA?", "Show my open stock orders", "How do I record a payment with proof?", "Show me everything in the app"],
  procurement: ["Which orders are waiting for a decision?", "Which deliveries are overdue?", "How do I verify a dealer's payment?", "Show dealers with the highest balance", "Show me everything in the app"],
};

/** Plain keyword search over the guide plus administrator-written entries (used when no AI model is connected). */
export function searchKnowledge(
  query: string,
  audience: Audience,
  extra: { title: string; body: string; tags: string[] }[] = [],
  limit = 3,
) {
  const stop = new Set(["the", "a", "an", "to", "of", "and", "or", "is", "are", "do", "does", "how", "what", "can", "i", "my", "me", "in", "on", "for", "it", "with", "by", "we", "you", "from", "this", "that", "show", "tell", "about", "please"]);
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  if (!words.length) return [];
  const docs = [
    ...extra.map((e) => ({ id: `kb:${e.title}`, title: e.title, body: e.body, tags: e.tags.join(" "), boost: 1.5 })),
    ...guideFor(audience).map((s) => ({ id: s.id, title: s.title, body: s.body, tags: "", boost: 1 })),
  ];
  const scored = docs
    .map((d) => {
      const t = d.title.toLowerCase(), b = d.body.toLowerCase(), g = d.tags.toLowerCase();
      let score = 0;
      for (const w of words) {
        const stem = w.length > 5 ? w.slice(0, -1) : w;
        if (t.includes(stem)) score += 4;
        if (g.includes(stem)) score += 3;
        const hits = b.split(stem).length - 1;
        score += Math.min(hits, 4);
      }
      return { ...d, score: score * d.boost };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
