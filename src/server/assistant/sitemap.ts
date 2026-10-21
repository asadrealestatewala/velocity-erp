import "server-only";
import type { PermissionKey } from "@/lib/permissions";
import type { Audience } from "./guide";

/**
 * Page-by-page map of the whole platform: where each screen is, what is on it and what you can do there. It is given to
 * the AI as reference material and is what the built-in (no-AI) mode searches to answer "where do I find…" questions.
 * tests/unit/assistant-knowledge.test.ts checks every path below against the real routes and every sidebar item against
 * this list, so the map cannot silently drift from the app.
 */
export type PageDoc = {
  id: string;
  /** The workspace the screen lives in. */
  workspace: Audience;
  /** Sidebar group heading that starts at this item (later items without one stay in the same group). */
  group?: string;
  /** false = reached from a button or the avatar menu rather than the sidebar. */
  sidebar?: false;
  label: string;
  path: string;
  /** Permission needed to open it (the sidebar hides the item without it). */
  perm?: PermissionKey;
  /** Only dealership managers get this sidebar item. */
  managerOnly?: boolean;
  summary: string;
  /** What is on the page: sections, tabs, filters, columns. */
  inside: string[];
  /** What the user can do there. */
  actions?: string[];
  /** Extra words people use for this screen. */
  keywords?: string[];
};

export const PAGES: PageDoc[] = [
  // ───────────────────────── Central CRM (head office) ─────────────────────────
  {
    id: "crm-dashboard", workspace: "crm", label: "Dashboard", path: "/crm/dashboard", perm: "dashboard.view",
    summary: "Network-wide performance at a glance for any period.",
    inside: [
      "Filter bar: Period (with presets), city, dealership, source, stage, employee.",
      "KPI tiles: total contacts, leads in period, new leads today, need follow-up, unassigned leads, assigned to dealers, test drives scheduled / completed, converted customers, lost leads, pending applications, active dealerships, recognised sales, recorded payments, lead→customer rate (each compares with the previous period; many tiles link to the matching list).",
      "Charts: lead creation trend, leads by stage, source, city, dealership, lead origin (company-assigned vs walk-in), top loss reasons, test-drive bookings.",
      "Panels: Unassigned — needs attention, upcoming follow-ups, recent activity, dealership performance.",
    ],
    actions: ["Click a tile to open the filtered contact list", "Change the period or filters to re-compute everything"],
    keywords: ["home", "overview", "kpi", "stats", "numbers", "summary", "performance"],
  },
  {
    id: "crm-contacts", workspace: "crm", label: "Contacts", path: "/crm/contacts", perm: "contacts.view",
    summary: "Every person and lead in the system, with powerful filters.",
    inside: [
      "Search by name, phone, email or business.",
      "Filters: type (lead/customer), stage, source, city, dealership, sales rep, test-drive status, assigned/unassigned, origin (company-assigned/walk-in), follow-up due, archived, created date, last-activity date.",
      "Table with each contact's phone, email, stage, dealership, rep and last activity; row menu with Edit and Assign.",
    ],
    actions: ["Add contact (+ button / New contact)", "Export CSV (needs export permission)", "Open a contact to see everything about them", "Assign leads to a dealership"],
    keywords: ["leads", "customers", "people", "search", "find customer", "export", "csv", "duplicates"],
  },
  {
    id: "crm-contact-detail", workspace: "crm", sidebar: false, label: "Contact page (profile)", path: "/crm/contacts/[id]", perm: "contacts.view",
    summary: "The full record of one contact: profile, lead, history and the records dock.",
    inside: [
      "Header buttons: Edit, Call, Email, Assign, Log interaction, Book test drive.",
      "Cards: General information, Test drives, Stage history, Assignment history, Form submissions (each inquiry kept separately).",
      "Records dock with tabs: Activity (filterable timeline), Chat (WhatsApp & email), Tasks, Notes, Documents, Payments. The dock collapses with the ✕ button.",
    ],
    actions: ["Change stage / mark converted or lost", "Log a call, message or meeting", "Add a note or task", "Upload a document", "Record a payment", "Chat on WhatsApp or email, or log a conversation manually"],
    keywords: ["profile", "timeline", "activity", "notes", "history", "customer record"],
  },
  {
    id: "crm-contact-new", workspace: "crm", sidebar: false, label: "New contact", path: "/crm/contacts/new", perm: "contacts.create",
    summary: "Create a contact (and optionally their lead).",
    inside: ["Contact details (name, phone, email, city, consent), lead details (interested model, source, description) and any custom fields. Possible duplicates are shown before saving."],
    actions: ["Save the contact", "Confirm or cancel when a duplicate is found"],
    keywords: ["add contact", "create lead", "new lead", "add customer"],
  },
  {
    id: "crm-pipeline", workspace: "crm", label: "Leads Pipeline", path: "/crm/pipeline", perm: "contacts.view",
    summary: "Kanban board (and list view) of leads by stage.",
    inside: ["Switch between board and list.", "Filters: search, source, city, dealership (or unassigned), owner/rep, origin, created date.", "One column per stage with lead cards."],
    actions: ["Drag a card to another stage (Converted asks for the sold model/value; Lost asks for a reason)"],
    keywords: ["kanban", "board", "stages", "funnel", "drag"],
  },
  {
    id: "crm-submissions", workspace: "crm", label: "Form Submissions", path: "/crm/submissions", perm: "submissions.view",
    summary: "Everything submitted through the public forms.",
    inside: ["Filters: search, form, status (new, reviewed, spam…), duplicates only, city, outlet, submitted date.", "Open a submission (#number) to see the answers, the matching duplicates and the consent text shown."],
    actions: ["Link a submission to an existing contact", "Create a contact/lead from it", "Mark reviewed or spam"],
    keywords: ["inbox", "web form", "enquiry", "inquiry", "spam"],
  },
  {
    id: "crm-forms", workspace: "crm", label: "Forms", path: "/crm/forms", perm: "forms.manage",
    summary: "Build and publish the public lead-capture forms (versioned).",
    inside: ["List of forms with their public URL.", "Form builder (/crm/forms/[id]): fields, conditional logic, consent and versions."],
    actions: ["New form", "Edit fields and publish a new version", "Open the public URL (/forms/test-drive, /forms/general-inquiry, /forms/dealership-application)"],
    keywords: ["form builder", "test drive form", "public form", "website"],
  },
  {
    id: "crm-test-drives", workspace: "crm", label: "Test Drives", path: "/crm/test-drives", perm: "testdrives.view",
    summary: "All test-drive bookings, as a list or a month calendar.",
    inside: ["List / calendar toggle with month navigation.", "Filters: status (upcoming, awaiting confirmation, requested, confirmed, completed, rescheduled, cancelled, no-show), outlet, city, model, scheduled date."],
    actions: ["Confirm, reschedule, complete, cancel or mark no-show", "Open the customer's contact page"],
    keywords: ["booking", "calendar", "ride", "demo ride"],
  },
  {
    id: "crm-dealerships", workspace: "crm", group: "Network", label: "Dealerships", path: "/crm/dealerships", perm: "dealerships.view",
    summary: "The dealership & outlet network.",
    inside: ["Counts of active dealerships and those receiving leads.", "Filters: search, status, city, type (dealership, outlet, franchise, sub-dealer).", "Open a dealership (/crm/dealerships/[id]) for its profile, outlets, team, models, hours and leads; Edit changes it."],
    actions: ["New dealership (starts Pending and gets no leads until onboarding is complete)", "Edit, activate, switch lead assignment on or off", "Jump to the dealership in Procurement"],
    keywords: ["outlets", "network", "dealers", "branches", "onboarding", "franchise"],
  },
  {
    id: "crm-dealership-new", workspace: "crm", sidebar: false, label: "New dealership", path: "/crm/dealerships/new", perm: "dealerships.manage",
    summary: "Create a dealership or outlet (Dealerships → New dealership).",
    inside: ["Profile, city and province, type (dealership, outlet, franchise, sub-dealer) and optional parent. New dealerships start as Pending and receive no leads until onboarding is complete."],
    keywords: ["add dealership", "create outlet", "onboard dealer"],
  },
  {
    id: "crm-applications", workspace: "crm", label: "Dealership Applications", path: "/crm/applications", perm: "applications.view",
    summary: "Applications to become a YADEA dealer.",
    inside: ["Counts: new, under review, awaiting information.", "Filters: search, status, city, reviewer.", "Open an application (#number) to read it, review it and follow the onboarding checklist."],
    actions: ["Move to Under review / Info required / Approved / Rejected (with reasons)", "Work through the onboarding checklist"],
    keywords: ["apply", "become a dealer", "approve dealer", "reject application"],
  },
  {
    id: "crm-bike-models", workspace: "crm", label: "Bike Models", path: "/crm/bike-models", perm: "dealerships.view",
    summary: "The administrator-managed catalogue of bike models.",
    inside: ["Models with code, category, prices, image and active state. Public forms list the active models from here."],
    actions: ["Add or edit a model (managers with permission)", "Deactivate a model (history is kept)"],
    keywords: ["models", "gt70", "ruibin", "keeness", "scooters", "catalogue", "products"],
  },
  {
    id: "crm-tasks", workspace: "crm", group: "Work", label: "Tasks", path: "/crm/tasks", perm: "tasks.manage",
    summary: "Tasks and follow-ups across the CRM.",
    inside: ["Filters: status, due (overdue / today / this week), assignee (me or anyone), type, priority."],
    actions: ["Complete or reopen a task", "Open the related contact"],
    keywords: ["todo", "follow up", "follow-up", "reminder", "overdue"],
  },
  {
    id: "crm-reports", workspace: "crm", label: "Reports & Analytics", path: "/crm/reports", perm: "reports.view",
    summary: "Detailed performance reports for any period.",
    inside: ["Filters: period, city, dealership, source, stage, salesperson.", "Headline metrics (leads, conversion, sales, payments, first-response time, follow-ups on time, test-drive completion), trends, leads by source / stage / city / dealership, origin split, loss reasons, dealership applications."],
    keywords: ["analytics", "conversion", "charts", "performance", "response time", "revenue"],
  },
  {
    id: "crm-leaderboard", workspace: "crm", label: "Leaderboard", path: "/crm/leaderboard", perm: "reports.view",
    summary: "Ranking of dealerships and salespeople by a normalised score.",
    inside: ["Date range (From/To), ranked table. Points come only from real events (first contact, fast response, on-time follow-ups, test drives, conversions)."],
    keywords: ["ranking", "points", "badges", "score", "gamification"],
  },
  {
    id: "crm-notifications", workspace: "crm", label: "Notifications", path: "/crm/notifications",
    summary: "Your in-app notifications (the bell icon in the top bar).",
    inside: ["Assignments, test-drive bookings and reminders, follow-ups, stock-order and payment updates, new customer messages."],
    actions: ["Mark as read", "Open the item a notification refers to"],
    keywords: ["bell", "alerts", "unread"],
  },
  {
    id: "crm-procurement", workspace: "crm", group: "Operations", label: "Procurement & Accounts", path: "/procurement/dashboard", perm: "procurement.view",
    summary: "Link from the CRM to the Procurement workspace (stock orders, catalogue, ledgers, vouchers, documents).",
    inside: ["Opens the Procurement portal dashboard — see the Procurement pages below."],
    keywords: ["stock orders", "accounts", "ledger", "dispatch"],
  },
  {
    id: "crm-knowledge", workspace: "crm", label: "Knowledge Base", path: "/crm/knowledge", perm: "settings.manage",
    summary: "Teach the assistant company-specific answers and check its status.",
    inside: ["Assistant status (AI connected or not), the built-in guide size, proposals awaiting confirmation, and your entries (title, text, tags, active/inactive)."],
    actions: ["Add, edit, deactivate or delete an entry — active entries are shared with every assistant user"],
    keywords: ["assistant", "chatbot", "train", "faq", "policies", "warranty"],
  },
  {
    id: "crm-users", workspace: "crm", group: "Admin", label: "Users & Permissions", path: "/crm/users", perm: "users.manage",
    summary: "Head-office users, departments and the role permission matrix.",
    inside: ["Users tab: name/email, role, department, dealerships, status (active, temp password), last sign-in; Departments card.", "Roles & permissions tab (/crm/users?tab=roles): tick which permissions each role has."],
    actions: ["Add/edit a user, reset a password, deactivate", "Change role permissions (you can't edit your own role and can only grant what you hold)", "Dealership users are managed from their dealership's team"],
    keywords: ["roles", "rbac", "access", "add user", "reset password", "permissions"],
  },
  {
    id: "crm-audit", workspace: "crm", label: "Audit Log", path: "/crm/audit", perm: "audit.view",
    summary: "Who did what and when, across the whole system.",
    inside: ["Filters: action text, dealership (or central only), entity, user, date range.", "Each entry shows the actor, time, entity and a readable list of what changed; IP addresses are visible to head office only."],
    keywords: ["history", "log", "security", "who changed", "tracking"],
  },
  {
    id: "crm-settings", workspace: "crm", label: "Settings", path: "/crm/settings", perm: "settings.manage",
    summary: "Business rules — nothing is hard-coded.",
    inside: [
      "Pipeline tab: pipeline stages (rename, reorder, colour, type Open/Won/Lost, default, notify on enter), loss reasons, lead sources.",
      "Cities & provinces tab: cities (active, province, sort order, outlet count) and provinces.",
      "Custom fields tab: extra contact fields (text, select…) shown on forms and profiles.",
      "Privacy & duplicates tab: privacy-policy URL, consent wording, default country code, duplicate matching by phone/email.",
      "Gamification & goals tab: points on/off, response window, badges and thresholds, dealership goals/targets.",
      "Notifications & system tab: email copies of notifications, test-drive reminder hours, booking minimum notice and horizon.",
    ],
    keywords: ["stages", "loss reasons", "sources", "cities", "custom fields", "privacy", "goals", "badges", "configuration"],
  },
  {
    id: "crm-account", workspace: "crm", sidebar: false, label: "Account & password", path: "/crm/account",
    summary: "Your own profile, password and notification preferences (avatar menu → Account & password).",
    inside: ["Change password, personal details, in-app / email notification switches per type."],
    keywords: ["change password", "profile", "my account", "sign out", "preferences"],
  },

  // ───────────────────────── Dealer Portal ─────────────────────────
  {
    id: "portal-dashboard", workspace: "portal", label: "Dashboard", path: "/portal/dashboard",
    summary: "Your dealership's home screen for the last 30 days.",
    inside: [
      "Points hero (points this month, badges, converted, conversion rate) with a link to the leaderboard.",
      "Respond to new leads first — new leads with a one-tap call button.",
      "KPI tiles: leads received, new leads, need follow-up, contacted, qualified & beyond, test drives scheduled/completed, converted, lost, pending tasks, overdue follow-ups, conversion rate.",
      "Showroom tiles (if you have inventory access): low stock, out of stock, open stock orders (and deliveries to confirm), balance owed to YADEA.",
      "Company-assigned vs walk-in lead cards, Goals & targets set by YADEA, your badges, upcoming test drives.",
    ],
    keywords: ["home", "overview", "stats", "points", "goals"],
  },
  {
    id: "portal-my-leads", workspace: "portal", group: "Leads", label: "My Leads", path: "/portal/leads?view=mine", perm: "contacts.view",
    summary: "Leads assigned to you personally.",
    inside: ["Same table and filters as All Dealership Leads, limited to you."],
    keywords: ["my customers", "assigned to me"],
  },
  {
    id: "portal-leads", workspace: "portal", group: "Leads", label: "All Dealership Leads", path: "/portal/leads", perm: "contacts.view",
    summary: "Every lead at your dealership (managers) — reps see theirs unless the dealership lets them see all.",
    inside: ["Filters: search, origin (company-assigned / walk-in), stage, rep (or unassigned), model, follow-up due/overdue."],
    actions: ["Open a lead to log calls, add notes and tasks, book a test drive and move the stage", "Managers assign leads to reps"],
    keywords: ["leads list", "assign to rep", "follow-up due"],
  },
  {
    id: "portal-company-leads", workspace: "portal", group: "Leads", label: "Company-Assigned", path: "/portal/leads?origin=COMPANY", perm: "contacts.view",
    summary: "Leads YADEA sent to you from central marketing, website forms and social channels.",
    inside: ["The leads list filtered to company-assigned leads."],
    keywords: ["head office leads", "yadea leads", "website leads"],
  },
  {
    id: "portal-walkin-leads", workspace: "portal", group: "Leads", label: "Walk-in Leads", path: "/portal/leads?origin=DEALERSHIP_WALK_IN", perm: "contacts.view",
    summary: "Leads your own team created for people who visited or called the showroom.",
    inside: ["The leads list filtered to walk-ins. These stay private to your dealership."],
    keywords: ["walk in", "showroom visitors"],
  },
  {
    id: "portal-lead-new", workspace: "portal", sidebar: false, label: "New walk-in lead", path: "/portal/leads/new", perm: "contacts.create",
    summary: "Add a customer who visited or contacted your dealership directly (the green + button in the top bar).",
    inside: ["Contact details, interested model, notes. Duplicates are detected by phone/email."],
    keywords: ["add customer", "new lead", "create contact"],
  },
  {
    id: "portal-pipeline", workspace: "portal", label: "Pipeline", path: "/portal/pipeline", perm: "contacts.view",
    summary: "Board of your dealership's leads by stage.",
    inside: ["Board / list toggle; filters: search, source, city, owner/rep, origin, created date."],
    actions: ["Drag leads between stages (Converted captures model and value; Lost needs a reason)"],
    keywords: ["kanban", "stages", "funnel"],
  },
  {
    id: "portal-contacts", workspace: "portal", label: "Contacts", path: "/portal/contacts", perm: "contacts.view",
    summary: "Customers who have leads at your dealership.",
    inside: ["Filterable table; open a customer for the full record (profile, Activity, Chat, Tasks, Notes, Documents, Payments tabs)."],
    keywords: ["customers", "people", "search customer"],
  },
  {
    id: "portal-test-drives", workspace: "portal", group: "Work", label: "Test Drives", path: "/portal/test-drives", perm: "testdrives.view",
    summary: "Test-drive bookings for your dealership (list or calendar).",
    inside: ["Filters: status (upcoming, awaiting confirmation…), model, scheduled date."],
    actions: ["Confirm, reschedule, complete, cancel or mark no-show"],
    keywords: ["booking", "calendar", "demo ride"],
  },
  {
    id: "portal-tasks", workspace: "portal", label: "Tasks & Follow-ups", path: "/portal/tasks", perm: "tasks.manage",
    summary: "Your tasks and follow-ups (managers also see the whole dealership's).",
    inside: ["Filters: status, due (overdue / today / this week), assignee, type, priority."],
    keywords: ["todo", "reminders", "overdue follow-ups"],
  },
  {
    id: "portal-inventory", workspace: "portal", group: "Showroom", label: "Inventory", path: "/portal/inventory", perm: "inventory.view",
    summary: "What your showroom holds right now: bike models and spare parts.",
    inside: [
      "Tiles: bikes in stock, spare parts in stock, low stock, out of stock.",
      "Two tabs: Bike models and Spare parts (GT70, Ruibin L, Ruibin S, Keeness and the parts catalogue).",
      "Table: item, code, (category), in stock, reorder level, status (In stock / Low stock / Out of stock), retail price, last updated; per-row Movements (history of every change) and Adjust.",
    ],
    actions: ["Add item (managers) with opening quantity and reorder level", "Adjust stock: add, remove or recount, with a reason", "Order from YADEA (button) when stock is low"],
    keywords: ["stock", "showroom", "quantity", "low stock", "reorder", "bikes", "spare parts"],
  },
  {
    id: "portal-sales-orders", workspace: "portal", label: "Customer Orders", path: "/portal/sales-orders", perm: "inventory.view",
    summary: "Purchase orders you raise for customers; confirming one deducts stock automatically.",
    inside: ["Filters: search (customer, phone or SO number), status (draft, confirmed, cancelled).", "Open an order (/portal/sales-orders/[id]) for lines, totals, the stock impact and a PDF download."],
    actions: ["New order: pick a contact or type a walk-in, add in-stock items, prices and discount", "Confirm (deducts stock, all or nothing) or cancel (returns stock)", "Download the PDF"],
    keywords: ["sales order", "purchase order", "sell", "invoice customer", "so number"],
  },
  {
    id: "portal-sales-order-new", workspace: "portal", sidebar: false, label: "New customer order", path: "/portal/sales-orders/new", perm: "salesorders.manage",
    summary: "Raise a purchase order for a customer (Customer Orders → New order).",
    inside: ["Choose the contact or type a walk-in's name and phone, add the bikes and spare parts that are in stock, edit prices and add a discount. Saved as a draft; Confirm deducts the stock."],
    keywords: ["sell", "new sale", "create order"],
  },
  {
    id: "portal-stock-orders", workspace: "portal", label: "Stock Orders", path: "/portal/stock-orders", perm: "procurement.order",
    summary: "Orders you place with YADEA procurement, and their delivery progress.",
    inside: ["Filters: order number, status (received, approved, rejected, cancelled, delivered…).", "Open an order (/portal/stock-orders/[id]) for the progress tracker (Received → Approved → Packing → Dispatched → In transit → Delivered), expected delivery date, courier and tracking, notes and the invoice."],
    actions: ["New stock order (/portal/stock-orders/new): choose bikes/parts, quantities, priority (Normal/Urgent), notes", "Cancel an order until procurement acts on it", "Confirm receipt when the delivery arrives (adds the stock; short deliveries supported)", "Download the invoice"],
    keywords: ["order from yadea", "purchase order", "po", "delivery", "dispatch", "tracking", "restock", "replenish"],
  },
  {
    id: "portal-stock-order-new", workspace: "portal", sidebar: false, label: "New stock order", path: "/portal/stock-orders/new", perm: "procurement.order",
    summary: "Order bikes and spare parts from YADEA procurement (Stock Orders → New stock order).",
    inside: ["Bike models and Spare parts tabs with a filter box, a quantity for each item, the Your order summary, priority (Normal / Urgent) and notes for procurement."],
    keywords: ["restock", "order from yadea", "replenish"],
  },
  {
    id: "portal-ledger", workspace: "portal", group: "Accounts", label: "Account Ledger", path: "/portal/ledger", perm: "ledger.view",
    summary: "Your account with YADEA: invoices, payments and the running balance.",
    inside: ["Tiles: total invoiced, total paid, awaiting verification.", "Period filter and the Statement table (date, entry, type, reference, description, debit, credit, running balance, status; a paperclip marks proof attached)."],
    actions: ["Record payment: amount, date, method, reference, optional order, proof of payment", "Download the statement as Excel or PDF for any period"],
    keywords: ["balance", "owed", "payment", "pay yadea", "statement", "invoice", "proof of payment", "excel", "pdf"],
  },
  {
    id: "portal-vouchers", workspace: "portal", label: "Expense Vouchers", path: "/portal/vouchers", perm: "vouchers.manage",
    summary: "Showroom expenses with their receipts and invoices, kept for tax records.",
    inside: ["Voucher list (EV-numbers) with category, payee, amount, tax, status and attached documents."],
    actions: ["New voucher: date, category, paid to, method, amount, tax included, reference, description", "Attach proof of payment, proof of invoice, the invoice or receipts (more can be added until it is reviewed)", "Export to Excel"],
    keywords: ["expense", "receipt", "tax", "taxation", "proof of invoice", "voucher"],
  },
  {
    id: "portal-documents", workspace: "portal", label: "Documents", path: "/portal/documents", perm: "dealerdocs.upload",
    summary: "Your dealership's papers, shared with YADEA, plus achievement certificates.",
    inside: ["Registration & business documents (certificate of registration, licences, tax registration, agreements; optional expiry date).", "Achievement certificates issued by YADEA — View or Download."],
    actions: ["Upload a document", "Download any document or certificate"],
    keywords: ["certificate", "registration", "licence", "upload", "achievement"],
  },
  {
    id: "portal-team", workspace: "portal", group: "Performance", label: "Team Performance", path: "/portal/team", managerOnly: true,
    summary: "Managers only: how each sales rep is doing and who is on the team.",
    inside: ["Last 30 days of activity per representative, and the Team members card."],
    actions: ["Add or remove sales representatives"],
    keywords: ["staff", "reps", "salespeople", "add user", "team members"],
  },
  {
    id: "portal-audit", workspace: "portal", label: "Audit Log", path: "/portal/audit", perm: "audit.view",
    summary: "A record of sensitive activity in your dealership (managers).",
    inside: ["Filters: activity area, who (including “YADEA team”), date range. Shows sign-ins, stock changes, orders, payments, documents and team changes."],
    keywords: ["history", "who changed", "log", "tracking"],
  },
  {
    id: "portal-leaderboard", workspace: "portal", label: "Leaderboard", path: "/portal/leaderboard",
    summary: "Rankings within your dealership by points.",
    inside: ["Date range and ranking; you only see individuals within your own dealership."],
    keywords: ["ranking", "points", "badges"],
  },
  {
    id: "portal-analytics", workspace: "portal", label: "Analytics", path: "/portal/analytics", perm: "reports.view",
    summary: "Reports for your dealership.",
    inside: ["Same report layout as the CRM (headline metrics, trends, leads by source / stage / city, loss reasons) limited to your dealership."],
    keywords: ["reports", "conversion", "charts"],
  },
  {
    id: "portal-notifications", workspace: "portal", label: "Notifications", path: "/portal/notifications",
    summary: "Your notifications (bell icon).",
    inside: ["New leads, test drives, follow-ups, stock-order updates, low stock, payment verification, new documents/certificates, customer messages."],
    keywords: ["bell", "alerts"],
  },
  {
    id: "portal-settings", workspace: "portal", label: "Dealership Settings", path: "/portal/settings",
    summary: "Your dealership profile and operational settings.",
    inside: ["Dealership name, code, type, status and whether it receives company leads; Operational settings (editable by managers)."],
    keywords: ["profile", "opening hours", "dealership details"],
  },
  {
    id: "portal-account", workspace: "portal", sidebar: false, label: "Account & password", path: "/portal/account",
    summary: "Your own password and notification preferences (avatar menu → Account & password).",
    inside: ["Change password (temporary passwords must be changed at first sign-in), per-type in-app / email notification switches."],
    keywords: ["change password", "my account", "sign out"],
  },

  // ───────────────────────── Procurement portal ─────────────────────────
  {
    id: "proc-dashboard", workspace: "procurement", label: "Dashboard", path: "/procurement/dashboard", perm: "procurement.view",
    summary: "Dealership stock orders, deliveries and accounts at a glance.",
    inside: ["Counts of orders received, approved, in progress, delivered and overdue.", "Needs a decision (oldest and urgent first), Upcoming deliveries (by expected date), Recent orders."],
    keywords: ["home", "overview", "queue"],
  },
  {
    id: "proc-orders", workspace: "procurement", group: "Orders", label: "Dealer Orders", path: "/procurement/orders", perm: "procurement.view",
    summary: "Every stock order placed by dealerships.",
    inside: ["Filters: search (PO no., dealership, tracking), status, dispatch status, dealership, overdue only, placed date.", "Open an order (/procurement/orders/[id]) for lines, the progress tracker, the dealer's account balance and notes."],
    actions: ["Approve (set each line's price, expected delivery date, internal note) or Reject (reason required)", "Update delivery: Packing → Dispatched → In transit → Delivered with courier, tracking and a note for the dealer", "Download the invoice"],
    keywords: ["purchase orders", "po", "approve order", "reject order", "dealer orders"],
  },
  {
    id: "proc-dispatch", workspace: "procurement", label: "Dispatch & Delivery", path: "/procurement/dispatch", perm: "procurement.view",
    summary: "Approved orders still on their way, oldest expected date first.",
    inside: ["Filters: dispatch status, overdue only. Overdue shipments are flagged."],
    actions: ["Update each step so dealers can track their delivery"],
    keywords: ["shipments", "courier", "tracking", "overdue deliveries", "in transit"],
  },
  {
    id: "proc-catalog", workspace: "procurement", group: "Catalogue", label: "Product Catalogue", path: "/procurement/catalog", perm: "catalog.manage",
    summary: "What dealers can stock and order — bike models and spare parts — with the prices YADEA charges them. Owned by the Procurement department.",
    inside: ["Bike models table: add and edit models here (name, code, category, availability, image, specifications) and set dealer prices.", "Spare parts table: SKU, name, category, retail price, dealer price, image, active state."],
    actions: ["New model / edit a model (needs the bike-model permission)", "New spare part", "Set prices (retail and dealer price) on a model or part", "Deactivate an item (history is kept)"],
    keywords: ["spare parts", "prices", "sku", "dealer price", "add part"],
  },
  {
    id: "proc-stock", workspace: "procurement", label: "Dealer Stock", path: "/procurement/stock", perm: "inventory.view_all",
    summary: "What each showroom holds right now, so you can see who needs replenishing.",
    inside: ["Filters: search (model, part or SKU), dealership, bikes/parts, stock level (low / out)."],
    keywords: ["inventory", "low stock", "dealer inventory", "who needs stock"],
  },
  {
    id: "proc-dealers", workspace: "procurement", group: "Dealers", label: "Dealerships", path: "/procurement/dealers", perm: "dealerships.view",
    summary: "All dealerships; open one for everything about it in one place.",
    inside: ["Filters: search (name, code, city), status.", "Dealership hub (/procurement/dealers/[id]) with tabs: Overview (portal users), Stock, Orders, Ledger, Vouchers, Documents."],
    keywords: ["dealer hub", "dealer overview", "portal users"],
  },
  {
    id: "proc-ledger", workspace: "procurement", label: "Ledgers & Payments", path: "/procurement/ledger", perm: "ledger.view",
    summary: "Verify dealer payments and see what each dealer owes.",
    inside: ["Payments awaiting verification (with proof attached).", "Dealer balances (total outstanding across dealerships); open a dealer's Ledger tab for the full statement."],
    actions: ["Verify a payment against its proof (it then reduces the balance) or reject it with a reason", "Post opening balances, credit notes and adjustments", "Export a statement as Excel or PDF"],
    keywords: ["verify payment", "balance", "receivable", "who owes", "credit note", "adjustment"],
  },
  {
    id: "proc-vouchers", workspace: "procurement", label: "Expense Vouchers", path: "/procurement/vouchers", perm: "vouchers.view_all",
    summary: "Vouchers submitted by dealerships with their receipts, invoices and proofs.",
    inside: ["Voucher list across dealerships with documents on file."],
    actions: ["Approve or reject a voucher (reason when rejecting)", "Export to Excel for tax records"],
    keywords: ["expenses", "tax", "receipts", "approve voucher"],
  },
  {
    id: "proc-documents", workspace: "procurement", label: "Documents & Certificates", path: "/procurement/documents", perm: "dealerdocs.admin",
    summary: "Each dealership's registration papers and the achievement certificates YADEA has issued.",
    inside: ["List of dealerships; open one to see and upload its documents."],
    actions: ["Upload a document on a dealership's behalf", "Issue an achievement certificate (the dealership is notified and can download it)"],
    keywords: ["certificate", "registration", "issue certificate", "upload"],
  },
  {
    id: "proc-notifications", workspace: "procurement", label: "Notifications", path: "/procurement/notifications",
    summary: "Your notifications (bell icon): new orders, payments to verify and more.",
    inside: ["In-app notification list."],
    keywords: ["bell", "alerts"],
  },
  {
    id: "proc-account", workspace: "procurement", sidebar: false, label: "Account & password", path: "/procurement/account",
    summary: "Your own password and notification preferences (avatar menu → Account & password).",
    inside: ["Change password and notification switches."],
    keywords: ["change password", "my account", "sign out"],
  },
];

/** Pages in the workspaces an audience can reach (a head-office user also reaches Procurement). */
const WORKSPACES: Record<Audience, Audience[]> = { crm: ["crm", "procurement"], portal: ["portal"], procurement: ["procurement"] };

export type Viewer = { can: (perm: PermissionKey) => boolean; isDealerManager: boolean };

/** The pages this viewer can actually open, in sidebar order. */
export function pagesFor(audience: Audience, viewer: Viewer): PageDoc[] {
  const spaces = WORKSPACES[audience];
  return PAGES.filter((p) => spaces.includes(p.workspace) && (!p.perm || viewer.can(p.perm)) && (!p.managerOnly || viewer.isDealerManager));
}

/** Pages written for the audience without checking permissions (used when no user is at hand). */
export const pagesForAudience = (audience: Audience) => PAGES.filter((p) => WORKSPACES[audience].includes(p.workspace));

const WORKSPACE_TITLE: Record<Audience, string> = { crm: "Central CRM", portal: "Dealer Portal", procurement: "Procurement Portal" };

/** Labels for deep links that are not pages of their own (a settings tab, a pre-filtered list, the sign-in pages). */
const LINK_LABELS: Record<string, string> = {
  "/login": "Staff sign-in",
  "/portal/login": "Dealer sign-in",
  "/procurement/login": "Procurement sign-in",
  "/crm/settings?tab=pipeline": "Settings → Pipeline",
  "/crm/settings?tab=locations": "Settings → Cities & provinces",
  "/crm/settings?tab=fields": "Settings → Custom fields",
  "/crm/settings?tab=privacy": "Settings → Privacy & duplicates",
  "/crm/settings?tab=gamification": "Settings → Gamification & goals",
  "/crm/settings?tab=operations": "Settings → Notifications & system",
  "/crm/users?tab=roles": "Users & Permissions → Roles & permissions",
  "/crm/contacts?assigned=no": "Unassigned leads",
  "/procurement/orders?overdue=1": "Dealer Orders (overdue only)",
  "/procurement/orders?status=SUBMITTED": "Dealer Orders (waiting for a decision)",
};
const OPEN_PATHS = new Set(["/login", "/portal/login", "/procurement/login"]);

/** A clickable link for a path — or null when the viewer can't open that screen (so nobody is pointed at a wall). */
export function linkFor(path: string, allowed: PageDoc[]): { label: string; path: string } | null {
  const hasBrackets = path.includes("[");
  if (hasBrackets) return null;
  const exact = allowed.find((p) => p.path === path);
  if (exact) return { label: exact.label, path };
  const base = path.split("?")[0]!;
  const label = LINK_LABELS[path];
  if (label && (OPEN_PATHS.has(path) || allowed.some((p) => p.path === base || p.path.split("?")[0] === base))) return { label, path };
  return null;
}

/** The sidebar heading each page sits under: a group starts at the item that names it and runs until the next one. */
export function sidebarGroups(pages: PageDoc[] = PAGES) {
  const groups = new Map<string, string>();
  const current: Partial<Record<Audience, string>> = {};
  for (const p of pages) {
    if (p.sidebar === false) continue;
    if (p.group) current[p.workspace] = p.group;
    if (current[p.workspace]) groups.set(p.id, current[p.workspace]!);
  }
  return groups;
}

/** Markdown text of the map, for the model's reference material. */
export function sitemapText(pages: PageDoc[]) {
  const groups = sidebarGroups();
  const out: string[] = [];
  for (const space of ["crm", "portal", "procurement"] as Audience[]) {
    const list = pages.filter((p) => p.workspace === space);
    if (!list.length) continue;
    out.push(`### ${WORKSPACE_TITLE[space]}`);
    for (const p of list) {
      const where = p.sidebar === false ? "not in the sidebar" : `sidebar${groups.get(p.id) ? `, group “${groups.get(p.id)}”` : ""}`;
      out.push(`- **${p.label}** — \`${p.path}\` (${where}). ${p.summary} On the page: ${p.inside.join(" ")}${p.actions?.length ? ` You can: ${p.actions.join("; ")}.` : ""}`);
    }
  }
  return out.join("\n");
}
