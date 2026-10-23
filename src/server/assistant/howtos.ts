import "server-only";
import type { Audience } from "./guide";
import type { Viewer } from "./sitemap";

/**
 * Step-by-step answers to the questions people actually ask. Each one names the screen to open (the `go` paths are checked
 * against the real routes in tests/unit/assistant-knowledge.test.ts). The AI gets them as reference material; the built-in
 * (no-AI) mode matches a question to the best recipe and shows its steps.
 */
export type HowTo = {
  id: string;
  audience: Audience[];
  /** The question this answers, phrased the way a user would ask it. */
  q: string;
  /** Other ways of asking it, and words that should lead here. */
  also?: string[];
  steps: string[];
  /** Screens to link to (paths from the page map). */
  go?: string[];
  tip?: string;
};

const CRM: Audience[] = ["crm"];
const PORTAL: Audience[] = ["portal"];
const PROC: Audience[] = ["procurement"];
const CRM_PORTAL: Audience[] = ["crm", "portal"];
const ALL: Audience[] = ["crm", "portal", "procurement"];

export const HOWTOS: HowTo[] = [
  // ───────── Everyone ─────────
  {
    id: "signin", audience: ALL, q: "How do I sign in?", also: ["login", "log in", "mobile number login", "phone login", "email login"],
    steps: [
      "Head-office staff sign in at /login, dealerships at /portal/login and procurement at /procurement/login.",
      "Dealership users can type their **email or their mobile number** (any format such as 0300 1234567 or +92 300 1234567) and their password.",
      "A temporary password must be replaced at first sign-in.",
      "After 8 failed attempts in 15 minutes sign-in is blocked for a while — wait and try again.",
    ],
    go: ["/login", "/portal/login", "/procurement/login"],
  },
  {
    id: "forgot-password", audience: ALL, q: "I forgot my password — what do I do?", also: ["reset password", "locked out", "can't log in", "cannot sign in"],
    steps: [
      "There is no self-service reset. Ask head office: a user with Users & Permissions access resets head-office and procurement users (Users tab → Reset password), and a dealership's team members are reset from the dealership's page in the CRM.",
      "You then receive a **temporary password** (shown once). Sign in with it and choose a new password straight away.",
    ],
  },
  {
    id: "change-password", audience: ALL, q: "How do I change my password or notification settings?", also: ["account", "profile", "notification preferences", "email notifications"],
    steps: ["Click your avatar (top right) → **Account & password**.", "**Change password**: enter your current password, the new one (at least 10 characters with a letter and a number) and confirm it.", "**Notification preferences**: switch in-app and email notifications on or off for each type (email is only delivered when the server has email configured)."],
    go: ["/crm/account", "/portal/account", "/procurement/account"],
  },
  {
    id: "assistant-help", audience: ALL, q: "What can the assistant do and how do I open it?", also: ["chatbot", "help", "what can you do", "ai assistant", "sparkle button"],
    steps: [
      "Click the **sparkle button** in the top bar to open the assistant; press Esc or ✕ to close it and the bin to clear the conversation.",
      "Ask how anything in the platform works, where to find a screen, or (when the AI is connected) for live numbers such as low stock or open orders.",
      "If your role allows it, the AI can **propose** changes. Nothing is saved until you press **Confirm** on the proposal card.",
    ],
  },
  {
    id: "notifications", audience: ALL, q: "Where do I see my notifications?", also: ["bell", "alerts", "unread"],
    steps: ["Click the **bell** in the top bar (the red number is your unread count) or open **Notifications** in the sidebar.", "Choose which notifications also come by email under Account & password."],
    go: ["/crm/notifications", "/portal/notifications", "/procurement/notifications"],
  },
  {
    id: "global-search", audience: ALL, q: "How do I search quickly?", also: ["search box", "find", "look up"],
    steps: ["Use the **search box at the top of the sidebar** (press **Ctrl K** to jump to it): contacts by name, phone, email or business (CRM and dealer portal); orders by number or dealership (procurement).", "For more control use the filter bar on any list page."],
  },
  {
    id: "upload-rules", audience: ALL, q: "What file types and sizes can I upload, and how many files at once?", also: ["file size limit", "max file size", "how many files can i upload", "how many files can i attach", "allowed file types", "upload limit", "file format", "which files are accepted", "why was my file rejected"],
    steps: [
      "Accepted types: **PDF, JPG, PNG, WEBP, DOCX and XLSX**. The file's real content is checked, so renaming another type doesn't work.",
      "Each file can be up to **10 MB** (the server default).",
      "You can attach **up to 8 files** in one go to a payment or an expense voucher, with about 12 MB in total per submission — attach the rest afterwards with **Attach**.",
      "If a file is refused, check the type and size first; a message under the upload field says why.",
    ],
  },
  {
    id: "mobile-menu", audience: ALL, q: "How do I open the menu on my phone?", also: ["mobile", "hamburger", "navigation"],
    steps: ["Tap the **☰ menu button** at the top left to open the sidebar, tap a page to go there, then ✕ to close it."],
  },

  // ───────── Central CRM ─────────
  {
    id: "crm-add-contact", audience: CRM, q: "How do I add a new contact or lead?", also: ["create contact", "new customer", "add lead", "new lead"],
    steps: ["Click **+ New contact** in the top bar (or Contacts → Add contact).", "Fill in name and phone or email, city and the interested model; add notes if useful.", "If the system finds a possible duplicate (same phone or email in any format) it shows it — open the existing contact, or confirm to create anyway.", "Press **Save**."],
    go: ["/crm/contacts/new"],
  },
  {
    id: "crm-find-contact", audience: CRM, q: "How do I find a contact or lead?", also: ["search customer", "filter contacts", "look up a customer by phone"],
    steps: ["Type a name, phone number, email or business in the **sidebar search**, or open **Contacts**.", "Narrow the list with the filters: type, stage, source, city, dealership, sales rep, test-drive status, assigned/unassigned, origin, follow-up due, created date or last activity.", "Click a row to open the contact page."],
    go: ["/crm/contacts"],
  },
  {
    id: "crm-export-contacts", audience: CRM, q: "How do I export contacts?", also: ["download contacts", "csv", "excel contacts"],
    steps: ["Open **Contacts**, apply the filters you want (the export keeps them).", "Click **Export CSV** (top right). The button only appears if your role has export permission."],
    go: ["/crm/contacts"],
  },
  {
    id: "crm-assign-lead", audience: CRM, q: "How do I assign a lead to a dealership?", also: ["reassign lead", "unassigned leads", "send lead to dealer", "assignment"],
    steps: [
      "Open the unassigned queue: **Assign leads** in the top bar, or the Unassigned tile on the Dashboard.",
      "On the contact row open the ⋯ menu → **Assign** (or press Assign on the contact page).",
      "Choose the **Dealership / outlet** (only active dealerships accepting leads are listed) and optionally the sales rep, add a reason, and press **Save assignment**. Choosing “Unassigned” sends it back to the central queue.",
      "Every assignment is stored with who, when and why, and the dealership is notified.",
    ],
    go: ["/crm/contacts?assigned=no"],
    tip: "New leads from the public forms are routed automatically by city and workload; manual assignment is for exceptions.",
  },
  {
    id: "crm-change-stage", audience: CRM_PORTAL, q: "How do I move a lead to another stage, mark it converted or lost?", also: ["change stage", "convert lead", "mark lost", "close lead", "pipeline stage"],
    steps: ["Open **Leads Pipeline** (Pipeline in the dealer portal) and drag the card to the new column — or change the stage on the contact page.", "**Converted** asks for the sold model and value.", "**Lost** requires a loss reason.", "Every change is saved in the Stage history."],
    go: ["/crm/pipeline", "/portal/pipeline"],
  },
  {
    id: "crm-log-interaction", audience: CRM_PORTAL, q: "How do I log a call, WhatsApp, SMS, email or meeting?", also: ["log interaction", "record a call", "call log", "activity"],
    steps: ["Open the contact page and press **Log interaction**.", "Choose the **Channel** (call, WhatsApp, SMS, email, meeting), the **Direction** (outbound = we contacted them, inbound = they contacted us) and the **Outcome** (Interested, Not interested, No answer, Call back later, Wrong number, Requested information, Booked test drive), add details and **Save**.", "It appears on the **Activity** tab of the records dock; the first contact with a new lead can earn points."],
  },
  {
    id: "crm-new-inquiry", audience: CRM_PORTAL, q: "A returning customer has a new inquiry — how do I add it?", also: ["new inquiry", "second lead", "existing contact new lead", "add lead to contact"],
    steps: ["Open the existing contact page and press **New inquiry**.", "Choose the interested model, describe the inquiry and press **Create lead**. Previous leads keep their history."],
  },
  {
    id: "crm-book-test-drive", audience: CRM_PORTAL, q: "How do I book a test drive for a customer?", also: ["schedule test drive", "test ride", "demo ride"],
    steps: ["Open the contact page and press **Book test drive**.", "Choose the **bike model** (only outlets set up for that model are listed), the **outlet**, date, time and optionally the representative. Opening hours, minimum notice, booking horizon and slot capacity are enforced.", "Tick **Confirmed with the customer** if they have already agreed the slot; otherwise the booking stays *Requested* until staff confirm it under Test Drives. Requests from the public form are never confirmed automatically."],
    go: ["/crm/test-drives", "/portal/test-drives"],
  },
  {
    id: "crm-test-drive-rules", audience: CRM_PORTAL, q: "How far ahead can a test drive be booked, and what rules apply?", also: ["booking horizon", "minimum notice", "booking rules", "how many days is a booking valid", "how long in advance", "slot capacity", "opening hours test drive", "why can't i book a slot"],
    steps: [
      "Every booking is checked against four things: the outlet's **opening hours**, a **minimum notice** period, a **booking horizon** (how many days ahead bookings are allowed) and the outlet's **slot capacity** (how many test drives can overlap).",
      "Head office sets the minimum notice and the booking horizon under **Settings → Notifications & system**; each dealership has its own hours and slot capacity (on its page under Dealerships).",
      "If a slot is refused, the message says which rule failed — pick another time or ask head office to adjust the rule.",
      "A request from the public form is never treated as confirmed until staff confirm it.",
    ],
    go: ["/crm/settings?tab=operations", "/crm/dealerships", "/portal/test-drives"],
  },
  {
    id: "crm-test-drive-status", audience: CRM_PORTAL, q: "How do I confirm, reschedule, complete or cancel a test drive?", also: ["test drive status", "no-show", "calendar"],
    steps: ["Open **Test Drives** and use the list or calendar view (month arrows to move around).", "Filter by status (upcoming, awaiting confirmation, confirmed, completed, rescheduled, cancelled, no-show), outlet, model or date.", "Open a booking and choose the new status. **Completed** advances the lead and awards points."],
    go: ["/crm/test-drives", "/portal/test-drives"],
  },
  {
    id: "crm-notes-tasks", audience: CRM_PORTAL, q: "How do I add a note or schedule a follow-up task?", also: ["add note", "create task", "reminder", "follow up"],
    steps: ["Open the contact page; in the records dock choose **Notes** or **Tasks**.", "Notes: type the note (pin it or share it with the customer if needed) and **Add note**.", "Tasks: set the title, type (call, follow-up, email, test drive, meeting, other), due date and priority. Overdue follow-ups notify the assignee once; completing one on time earns points."],
    go: ["/crm/tasks", "/portal/tasks"],
  },
  {
    id: "crm-chat", audience: CRM_PORTAL, q: "How do I message or call a customer on WhatsApp?", also: ["whatsapp", "send message", "call customer", "phone icon", "log a conversation", "chat"],
    steps: [
      "Find the contact in **Contacts** (or open their page).",
      "Next to the phone number, click the green **WhatsApp** icon to open the chat with that number in WhatsApp, or the **phone** icon to call.",
      "The conversation itself happens in WhatsApp. To keep a record, open the contact and press **Log interaction**, choose WhatsApp or Call, and note what was said — it appears on the activity timeline.",
      "Contacts who opted out of a channel should not be contacted on it.",
    ],
  },
  {
    id: "crm-documents-payments", audience: CRM_PORTAL, q: "How do I upload a customer document or record a customer payment?", also: ["upload document", "attach file", "record payment on contact", "customer payment"],
    steps: ["Open the contact page and choose **Documents** or **Payments** in the records dock (they appear only if your role has access).", "Documents: pick a category and file, then upload. Payments: enter amount, date, method and status.", "Note: customer payments recorded here are manual and unverified; dealer payments *to YADEA* are recorded in the Account Ledger."],
  },
  {
    id: "crm-forms", audience: CRM, q: "How do I create or edit a public form?", also: ["form builder", "test drive form", "inquiry form", "publish form"],
    steps: ["Open **Forms** and press **New form** (or click an existing form).", "In the builder add fields, conditional logic and the consent wording, then **Save draft**.", "Press **Publish** to make the changes live as a new version (an “Unpublished changes” badge shows when edits aren't live yet).", "Share the public link (for example /forms/test-drive). Each submission stores the exact consent text shown."],
    go: ["/crm/forms"],
  },
  {
    id: "crm-submissions", audience: CRM, q: "How do I handle a form submission?", also: ["web enquiry", "review submission", "spam submission", "link submission to contact"],
    steps: ["Open **Form Submissions** (filter by form, status, duplicates, city, outlet or date).", "Open the submission to read the answers and see possible duplicates.", "Link it to an existing contact or create a contact/lead from it; mark spam where needed."],
    go: ["/crm/submissions"],
  },
  {
    id: "crm-new-dealership", audience: CRM, q: "How do I add and onboard a new dealership?", also: ["create dealership", "new outlet", "onboarding", "activate dealership"],
    steps: ["Open **Dealerships** → **New dealership**, fill the profile, city and type, and save — it starts as **Pending** and receives no leads yet.", "Open it and create the manager's account (a temporary password is shown once).", "Configure the models it offers and its hours, then set it **Active** and switch lead assignment on."],
    go: ["/crm/dealerships/new", "/crm/dealerships"],
  },
  {
    id: "crm-applications", audience: CRM, q: "How do I review a dealership application?", also: ["approve application", "reject application", "become a dealer"],
    steps: ["Open **Dealership Applications**, filter by status, city or reviewer, and click an application.", "Move it to Under review, Info required, Approved or Rejected — each with reasons and history.", "Approval creates nothing automatically; follow the onboarding checklist (verify → create the dealership → create the manager account → models → activate → enable leads → notify)."],
    go: ["/crm/applications"],
  },
  {
    id: "crm-add-user", audience: CRM, q: "How do I add a user or reset someone's password?", also: ["create user", "new staff", "reset password", "deactivate user"],
    steps: ["Open **Users & Permissions → Users** and press **New user**; choose name, email, role and department.", "A temporary password is shown **once** — share it securely; the user must change it at first sign-in.", "To reset later use **Reset password** on the user's row (their sessions are signed out). Edit the user to change role or deactivate them.", "Dealership users are managed from their dealership's team in Dealerships."],
    go: ["/crm/users"],
  },
  {
    id: "crm-permissions", audience: CRM, q: "How do I change what a role can do?", also: ["permissions", "access", "rbac", "role matrix"],
    steps: ["Open **Users & Permissions → Roles & permissions**.", "Tick or untick permissions per role. You can't edit your own role, the Super Administrator role is fixed, and you can only grant permissions you hold.", "Dealership-only permissions (inventory, customer orders, stock orders, payments to YADEA, vouchers) are never granted to head-office roles."],
    go: ["/crm/users?tab=roles"],
  },
  {
    id: "crm-settings-pipeline", audience: CRM, q: "How do I change pipeline stages, loss reasons or lead sources?", also: ["stages", "loss reasons", "sources", "rename stage"],
    steps: ["Open **Settings → Pipeline**.", "Rename, reorder (arrows), recolour, activate/deactivate stages and set the type (Open, Won, Lost), default stage and notify-on-enter.", "Add or edit loss reasons (required when a lead is marked Lost) and lead sources below."],
    go: ["/crm/settings?tab=pipeline"],
  },
  {
    id: "crm-settings-cities", audience: CRM, q: "How do I add a city or province?", also: ["cities", "provinces", "locations"],
    steps: ["Open **Settings → Cities & provinces**.", "Add the province first if needed, then the city (pick its province, sort order and Active). Public forms list the active cities."],
    go: ["/crm/settings?tab=locations"],
  },
  {
    id: "crm-settings-fields", audience: CRM, q: "How do I add a custom contact field?", also: ["custom fields", "extra field"],
    steps: ["Open **Settings → Custom fields**.", "Enter a label and key, choose the type (and comma-separated options for a dropdown) and add it. It then shows on contact forms and profiles."],
    go: ["/crm/settings?tab=fields"],
  },
  {
    id: "crm-settings-goals", audience: CRM, q: "How do I set dealership goals or change points and badges?", also: ["goals", "targets", "gamification", "badges", "points"],
    steps: ["Open **Settings → Gamification & goals**.", "Switch points on/off, set the fast-response window, edit badge names and thresholds.", "Add a goal: name, metric, target, dealership (or all) and start/end dates. Dealers see progress on their dashboard."],
    go: ["/crm/settings?tab=gamification"],
  },
  {
    id: "crm-settings-system", audience: CRM, q: "Where do I change test-drive booking rules, reminders or privacy wording?", also: ["booking rules", "reminder hours", "consent text", "duplicate matching", "privacy policy"],
    steps: ["**Settings → Notifications & system**: email copies of notifications, upcoming test-drive reminder hours, minimum notice and how many days ahead bookings are allowed.", "**Settings → Privacy & duplicates**: privacy-policy URL, consent wording, default country code and duplicate matching by phone/email."],
    go: ["/crm/settings?tab=operations", "/crm/settings?tab=privacy"],
  },
  {
    id: "crm-appoint-head", audience: CRM, q: "How do I appoint a Dealerships Head, or give a head more dealerships?", also: ["dealerships head", "regional head", "area head", "head of dealerships", "add head to dealership", "head over several dealerships", "dealership head account"],
    steps: [
      "A **Dealerships Head** oversees several dealerships (possibly across regions). Each dealership still has its own outlet manager; the head is an extra person above them.",
      "Open **Dealerships**, open the dealership, find the **Team** panel and press **Add team member**.",
      "Choose the role **Dealerships head (oversees several dealerships)**, enter their name and email (and mobile) and save. A new account is created with a one-time temporary password they must change at first sign-in; for someone who is already a head, just use their email — they keep their role.",
      "Repeat on every dealership they oversee. To remove one, set that membership inactive in the same Team panel.",
      "From then on every lead assigned to those dealerships shows in the head's portal (All Dealership Leads), and they can assign leads to reps, run the team, place stock orders and see the ledger of each dealership.",
    ],
    go: ["/crm/dealerships"],
  },
  {
    id: "crm-bike-models", audience: CRM, q: "How do I add or edit a bike model?", also: ["new model", "gt70", "ruibin", "keeness", "deactivate model"],
    steps: ["Open **Bike Models** and press **New model** (needs permission), or edit a row.", "Enter name, code, category, price and image. Active models appear on the public forms and can be stocked and ordered.", "Dealer prices (what dealers pay YADEA) are set in Procurement → Product Catalogue."],
    go: ["/crm/bike-models", "/procurement/catalog"],
  },
  {
    id: "crm-reports", audience: CRM_PORTAL, q: "Where are the reports and how do I read them?", also: ["analytics", "conversion rate", "performance report", "first response time"],
    steps: ["Open **Reports & Analytics** (Analytics in the dealer portal) and choose the period and filters.", "Headline metrics: leads created, lead→customer %, converted and lost, recognised sales, recorded payments, average first response, follow-ups on time, test-drive completion.", "Below are trends and breakdowns by source, stage, city, dealership, origin and loss reason.", "Conversion = leads created in the period that are now converted ÷ leads created."],
    go: ["/crm/reports", "/portal/analytics"],
  },
  {
    id: "crm-audit", audience: CRM, q: "How do I see who changed something?", also: ["audit log", "history", "track changes", "who deleted", "security log"],
    steps: ["Open **Audit Log** and filter by action text, dealership (or central only), entity, user and date range.", "Each row shows who, when, what and a readable list of the changes. Dealerships see only their own slice in their portal."],
    go: ["/crm/audit"],
  },
  {
    id: "crm-teach-assistant", audience: CRM, q: "How do I teach the assistant company-specific answers?", also: ["knowledge base", "train the chatbot", "add faq", "policies", "warranty answer"],
    steps: ["Open **Knowledge Base** and press **New entry**.", "Write a clear title (for example “Battery warranty”), the answer in plain language and optional tags, then save.", "Active entries are shared with every assistant user straight away; edit, deactivate or delete them any time.", "The assistant already knows how every screen works — use entries for *your* policies, prices rules and contacts."],
    go: ["/crm/knowledge"],
  },
  {
    id: "crm-leaderboard", audience: CRM_PORTAL, q: "How do points, badges and the leaderboard work?", also: ["points", "badges", "ranking", "gamification", "score"],
    steps: ["Points are awarded only for real events: first contact, a fast response, on-time follow-ups, stage advances, completed test drives and conversions — each event counts once.", "The **Leaderboard** ranks by a normalised score so outlets of different sizes compare fairly. Dealers only see individuals within their own dealership.", "Admins tune points, badges and goals in Settings → Gamification & goals."],
    go: ["/crm/leaderboard", "/portal/leaderboard"],
  },

  // ───────── Dealer portal ─────────
  {
    id: "portal-walk-in", audience: PORTAL, q: "How do I add a walk-in customer?", also: ["new walk-in lead", "add customer", "showroom visitor", "new lead"],
    steps: ["Click the green **+ New walk-in lead** button in the top bar.", "Enter the customer's name, phone or email, interested model and notes, then save.", "The lead stays with your dealership (it appears under **Walk-in Leads**). Duplicates are caught by phone/email."],
    go: ["/portal/leads/new", "/portal/leads?origin=DEALERSHIP_WALK_IN"],
  },
  {
    id: "portal-my-leads", audience: PORTAL, q: "Where are my leads and the leads YADEA sent me?", also: ["company leads", "assigned leads", "my customers", "walk-in leads"],
    steps: ["**My Leads** — assigned to you. **All Dealership Leads** — everyone's (managers).", "**Company-Assigned** — leads YADEA routed to you from marketing, forms and social. **Walk-in Leads** — created by your own team.", "Use the filters (origin, stage, rep, model, follow-up due) to narrow any list. The dashboard's “Respond to new leads first” panel gives one-tap calling."],
    go: ["/portal/leads?view=mine", "/portal/leads", "/portal/leads?origin=COMPANY"],
  },
  {
    id: "portal-assign-rep", audience: PORTAL, q: "How do I assign a lead to a sales rep?", also: ["give lead to rep", "reassign lead", "unassigned lead"],
    steps: ["Managers: open **All Dealership Leads** and filter Rep → Unassigned if you like.", "Open the ⋯ menu on the contact → **Assign** (or Assign on the contact page), pick the rep and save.", "You can only choose reps inside your own dealership."],
    go: ["/portal/leads"],
  },
  {
    id: "portal-head", audience: PORTAL, q: "I head several dealerships — how do I work all their leads and switch between them?", also: ["dealerships head", "multiple dealerships", "switch dealership", "regional head", "all my dealerships", "leads from all my dealerships"],
    steps: [
      "**All Dealership Leads**, Pipeline, Contacts, Test Drives, Tasks and the dashboard numbers combine every dealership you head.",
      "Pages about one dealership's own books — **Inventory, Customer Orders, Stock Orders, Account Ledger, Expense Vouchers, Documents** — have a **dealership switcher** at the top: pick which dealership you are working in.",
      "Assign a lead to a sales rep from its row menu → **Assign**, and manage each dealership's reps from **Team Performance**. Anything you do is recorded in that dealership's audit log.",
      "Head office adds or removes dealerships from your portal (CRM → Dealerships → Team).",
    ],
    go: ["/portal/leads", "/portal/team"],
  },
  {
    id: "portal-team", audience: PORTAL, q: "How do I add or remove a sales rep on my team?", also: ["team members", "add staff", "add user", "remove rep", "team performance"],
    steps: ["Managers open **Team Performance** and use the **Team members** card to add or remove sales representatives.", "The page also shows each rep's activity for the last 30 days."],
    go: ["/portal/team"],
  },
  {
    id: "portal-inventory-add", audience: PORTAL, q: "How do I add an item to my showroom inventory?", also: ["add stock item", "opening stock", "start inventory", "add bike model to inventory"],
    steps: ["Managers open **Inventory** and choose the **Bike models** or **Spare parts** tab.", "Press **Add item**, pick the model or part from the catalogue, enter the opening quantity and a reorder level, and save.", "Items that aren't in the list haven't been created by YADEA yet — ask procurement to add them to the catalogue."],
    go: ["/portal/inventory"],
  },
  {
    id: "portal-inventory-adjust", audience: PORTAL, q: "How do I add, remove or recount stock and see its history?", also: ["adjust stock", "stock count", "damaged stock", "movement history", "stock movements"],
    steps: ["Open **Inventory**, find the item and press **Adjust** (managers).", "Choose **Add**, **Remove** or **Recount (set)**, enter the quantity and a reason.", "Press the history (Movements) button on the row to see every change: who, when, why and the new quantity.", "Stock can never go below zero. Customer orders and YADEA deliveries change stock automatically — don't adjust for those."],
    go: ["/portal/inventory"],
  },
  {
    id: "portal-low-stock", audience: PORTAL, q: "How do I see which items are low or out of stock?", also: ["low stock", "out of stock", "reorder", "what do I need to order"],
    steps: ["Open **Inventory**: the tiles show **Low stock** and **Out of stock**, and each row has a status badge (In stock / Low stock / Out of stock).", "An item is Low when its quantity is at or below its reorder level. Managers also get a low-stock notification.", "Press **Order from YADEA** to restock."],
    go: ["/portal/inventory"],
  },
  {
    id: "portal-sales-order", audience: PORTAL, q: "How do I record a customer's purchase and deduct the stock?", also: ["customer order", "sales order", "sell a bike", "purchase order", "deduct stock", "new order"],
    steps: ["Open **Customer Orders → New order**.", "Pick the contact (or type a walk-in's name and phone), add bikes/spare parts that are in stock, edit prices and add a discount if needed.", "Save it as a **draft** (no stock change), or press **Confirm order & deduct stock** straight away when the sale is agreed. A draft is confirmed later with **Confirm & deduct stock** on its page.", "Confirming deducts every line in one step, all or nothing — if any item lacks stock nothing is deducted. Download the order as a **PDF** from its page."],
    go: ["/portal/sales-orders/new", "/portal/sales-orders"],
  },
  {
    id: "portal-cancel-sales-order", audience: PORTAL, q: "How do I cancel a customer order?", also: ["cancel sale", "cancel draft", "undo order", "return stock", "customer returned the bike"],
    steps: ["Open the order from **Customer Orders** and press **Cancel order**.", "Enter a reason and confirm (**Keep order** leaves it as it is).", "Cancelling a **confirmed** order puts every item back into your showroom stock and shows on the customer's timeline; cancelling a draft changes no stock."],
    go: ["/portal/sales-orders"],
  },
  {
    id: "portal-cancel-stock-order", audience: PORTAL, q: "How do I cancel a stock order I placed with YADEA?", also: ["withdraw order", "cancel purchase order", "cancel po", "can i cancel a stock order", "stock order cancelled"],
    steps: ["Open the order on **Stock Orders** and press **Cancel order**, then confirm.", "This is only possible while the order is still **Received** — once procurement has approved or rejected it, it can no longer be withdrawn. This can't be undone.", "If it is already approved and you no longer need it, contact YADEA procurement."],
    go: ["/portal/stock-orders"],
  },
  {
    id: "portal-stock-order", audience: PORTAL, q: "How do I order bikes or spare parts from YADEA?", also: ["stock order", "purchase order to yadea", "restock", "new stock order", "order spare parts"],
    steps: ["Open **Stock Orders → New stock order**.", "On the **Bike models** / **Spare parts** tabs enter the quantity for each item you need (use the filter box to find items).", "Choose priority (**Normal** or **Urgent — stock is running out**), add notes for procurement, and submit.", "Prices come from the catalogue's dealer price when set; otherwise procurement confirms them on approval."],
    go: ["/portal/stock-orders/new"],
  },
  {
    id: "portal-track-order", audience: PORTAL, q: "How do I track my stock order and its delivery?", also: ["order status", "delivery date", "expected delivery", "dispatch status", "tracking number", "where is my order"],
    steps: ["Open **Stock Orders** and click the order (filter by number or status).", "The progress tracker shows **Received → Approved → Packing → Dispatched → In transit → Delivered**, with the expected delivery date, courier and tracking number once procurement adds them.", "You are notified at every step. An order can be cancelled until procurement acts on it."],
    go: ["/portal/stock-orders"],
  },
  {
    id: "portal-confirm-receipt", audience: PORTAL, q: "How do I confirm a delivery has arrived?", also: ["confirm receipt", "receive stock", "delivery received", "short delivery", "add stock from delivery"],
    steps: ["When the delivery arrives open the order on **Stock Orders** and press **Confirm receipt**.", "Enter the quantities that **actually arrived** (short deliveries are fine).", "Only then does your showroom stock increase — the stock movement history shows it."],
    go: ["/portal/stock-orders"],
  },
  {
    id: "portal-invoice", audience: PORTAL, q: "Where do I download the invoice for a stock order?", also: ["invoice", "download invoice", "order invoice pdf"],
    steps: ["Open the order on **Stock Orders** and use the invoice/download button.", "The invoice is raised on your ledger once, when the order is dispatched."],
    go: ["/portal/stock-orders", "/portal/ledger"],
  },
  {
    id: "portal-record-payment", audience: PORTAL, q: "How do I record a payment to YADEA with proof?", also: ["pay yadea", "record payment", "proof of payment", "bank transfer proof", "upload receipt"],
    steps: ["Open **Account Ledger** and press **Record payment**.", "Enter the amount, payment date, method and your transaction/cheque reference; optionally choose the order it applies to.", "Attach the **proof of payment** (bank slip, transfer screenshot or signed receipt) — it is required.", "The payment shows as *awaiting verification* and only reduces your balance once YADEA accounts verifies it (or rejects it with a reason)."],
    go: ["/portal/ledger"],
  },
  {
    id: "portal-balance", audience: PORTAL, q: "How much do I owe YADEA and why hasn't my payment reduced it?", also: ["balance", "outstanding", "owed", "account balance", "payment pending"],
    steps: ["Open **Account Ledger**: **Total invoiced**, **Total paid** and **Awaiting verification** tiles, then the statement with a running balance.", "Balance owed = posted invoices − *verified* payments. A payment you reported stays under Awaiting verification until YADEA accounts checks it against the proof.", "If a payment was rejected, the reason is shown on the entry — record it again with the right proof."],
    go: ["/portal/ledger"],
  },
  {
    id: "portal-download-ledger", audience: PORTAL, q: "How do I download my ledger as Excel or PDF?", also: ["export ledger", "statement", "ledger excel", "ledger pdf", "account statement"],
    steps: ["Open **Account Ledger**, choose the **Period** (presets or custom dates).", "Press **Excel** or **PDF** above the statement. The file includes every entry with the running balance."],
    go: ["/portal/ledger"],
  },
  {
    id: "portal-voucher", audience: PORTAL, q: "How do I create an expense voucher and attach receipts or proof of payment?", also: ["expense voucher", "receipt", "tax record", "proof of invoice", "attach invoice", "taxation"],
    steps: ["Open **Expense Vouchers** → **New voucher**.", "Enter date, category, who you paid, payment method, amount, the tax included and a reference.", "Attach supporting documents (proof of payment, proof of invoice, the invoice, receipts — any type). Use **Attach** later to add more.", "YADEA accounts approve or reject the voucher; after review its evidence is frozen. Export vouchers to Excel for taxation."],
    go: ["/portal/vouchers"],
  },
  {
    id: "portal-documents", audience: PORTAL, q: "How do I upload my registration certificate or download an achievement certificate?", also: ["certificate of registration", "upload document", "licence", "achievement certificate", "download certificate"],
    steps: ["Open **Documents**.", "**Registration & business documents**: upload your certificate of registration, licences, tax registration or agreements (optional expiry date). YADEA sees the same list.", "**Achievement certificates** are issued by YADEA — you are notified and can **View** or **Download** them here."],
    go: ["/portal/documents"],
  },
  {
    id: "portal-audit", audience: PORTAL, q: "Where can I see what happened in my dealership?", also: ["audit log", "activity log", "who changed stock", "history"],
    steps: ["Managers open **Audit Log** and filter by activity area, person (including “YADEA team”) and date range.", "It covers sign-ins, stock changes, orders, payments, documents and team changes. IP addresses are never shown to dealerships."],
    go: ["/portal/audit"],
  },
  {
    id: "portal-dashboard", audience: PORTAL, q: "What is on my dashboard?", also: ["home", "kpi", "goals", "points"],
    steps: ["Your points this month, badges and conversion rate; “Respond to new leads first”; lead and test-drive tiles; showroom tiles (low stock, out of stock, open stock orders, balance owed); company vs walk-in lead cards; goals set by YADEA; upcoming test drives."],
    go: ["/portal/dashboard"],
  },
  {
    id: "portal-settings", audience: PORTAL, q: "Where do I see or change my dealership details?", also: ["dealership profile", "dealership settings", "opening hours"],
    steps: ["Open **Dealership Settings** to see your dealership name, code, type, status and whether you receive company leads; managers can edit the operational settings.", "Your own password and notification preferences are under Account & password."],
    go: ["/portal/settings"],
  },

  // ───────── Procurement ─────────
  {
    id: "proc-approve", audience: PROC, q: "How do I approve or reject a dealer's stock order?", also: ["approve order", "reject order", "orders waiting for a decision", "new orders"],
    steps: ["Open **Dealer Orders** (or *Needs a decision* on the Dashboard) and click the order.", "**Approve**: confirm each line's price, set the expected delivery date and an internal note.", "**Reject**: a reason is required and the dealer is notified.", "Filter the list by status, dispatch status, dealership, overdue or date."],
    go: ["/procurement/orders"],
  },
  {
    id: "proc-dispatch", audience: PROC, q: "How do I update dispatch and delivery?", also: ["dispatch", "mark delivered", "courier", "tracking number", "in transit", "packing"],
    steps: ["Open the approved order and press **Update delivery**.", "Choose the new status — Packing, Dispatched, In transit or Delivered — and add the courier, tracking/consignment number, expected date and a note for the dealer.", "Status can only move forward. **Dispatching raises the invoice on the dealer's ledger once.** The dealer is notified at each step and confirms receipt to add the stock."],
    go: ["/procurement/orders", "/procurement/dispatch"],
  },
  {
    id: "proc-overdue", audience: PROC, q: "Which deliveries are overdue?", also: ["late deliveries", "overdue orders", "expected delivery passed"],
    steps: ["Open **Dispatch & Delivery** and set *All deliveries → Overdue only* (the same filter exists on Dealer Orders).", "Open shipments are listed oldest expected date first, with overdue ones flagged. The Dashboard also counts them."],
    go: ["/procurement/dispatch", "/procurement/orders?overdue=1"],
  },
  {
    id: "proc-stock", audience: PROC, q: "How do I see which dealers are low on stock?", also: ["dealer stock", "dealer inventory", "who needs replenishing", "out of stock dealers"],
    steps: ["Open **Dealer Stock** and set *Any stock level → Low stock* or *Out of stock*.", "Narrow by dealership, bikes or parts, or search a model, part or SKU. A dealership's hub also has a **Stock** tab."],
    go: ["/procurement/stock"],
  },
  {
    id: "proc-add-part", audience: PROC, q: "How do I add a spare part or set dealer prices?", also: ["new spare part", "product catalogue", "set price", "dealer price", "retail price", "sku"],
    steps: ["Open **Product Catalogue**.", "**New spare part**: part name, SKU, category, unit, retail price, dealer price (what dealers pay YADEA), image and active state.", "**Set prices** on a bike model or part to change retail/dealer prices. Only the prices you enter are ever used — the system never invents prices.", "Bike models are added and edited on the same page with **New model** (or the pencil on a model row). Deactivating an item hides it from ordering but keeps history."],
    go: ["/procurement/catalog"],
  },
  {
    id: "proc-bike-model", audience: PROC, q: "How do I add or edit a bike model in the product catalogue?", also: ["new bike model", "add model", "edit model", "gt70", "ruibin", "keeness", "model availability", "model specifications", "deactivate model"],
    steps: ["Open **Product Catalogue** and press **New model** (top right), or the pencil on a model's row to edit it.", "Enter the **model name**, **code** (capital letters, numbers, dashes), category, availability (Available, Coming soon, Out of stock, Discontinued), optional price, image and specifications. Use official product data only — nothing is invented for you.", "Save. Active models appear on the public forms and can be stocked and ordered; set what dealers pay with **Set prices** on the same row.", "To retire a model, untick Active (history in leads, bookings and orders is kept)."],
    go: ["/procurement/catalog"],
    tip: "Procurement and administrators can manage bike models; sales & CRM staff and dealerships cannot.",
  },
  {
    id: "proc-verify-payment", audience: PROC, q: "How do I verify or reject a dealer's payment?", also: ["verify payment", "payment awaiting verification", "reject payment", "proof of payment check"],
    steps: ["Open **Ledgers & Payments** — *Payments awaiting verification* lists each payment with its proof.", "Check the proof (bank slip, transfer screenshot, receipt), then **Verify** — only then does it reduce the dealer's balance — or **Reject** with a reason.", "The dealership is notified either way."],
    go: ["/procurement/ledger"],
  },
  {
    id: "proc-ledger", audience: PROC, q: "How do I see what a dealer owes, post an adjustment or export a ledger?", also: ["dealer balance", "who owes", "credit note", "opening balance", "adjustment", "export ledger", "highest balance"],
    steps: ["Open **Ledgers & Payments** for *Dealer balances* (total outstanding is shown), then open a dealer's **Ledger** tab for the full statement.", "Post opening balances, credit notes or adjustments from the dealer's ledger (needs the ledger-management permission).", "Download the statement as **Excel** or **PDF** for any period."],
    go: ["/procurement/ledger", "/procurement/dealers"],
  },
  {
    id: "proc-vouchers", audience: PROC, q: "How do I review expense vouchers and export them for tax?", also: ["approve voucher", "reject voucher", "expense voucher", "tax export"],
    steps: ["Open **Expense Vouchers** to see vouchers across dealerships with their documents (proof of payment, invoices, receipts).", "**Approve** or **Reject** (with a reason). Payment-to-YADEA vouchers follow ledger verification.", "Use the Excel export for tax amounts and the documents on file."],
    go: ["/procurement/vouchers"],
  },
  {
    id: "proc-documents", audience: PROC, q: "How do I upload a dealer's documents or issue an achievement certificate?", also: ["issue certificate", "achievement certificate", "registration certificate", "dealer documents"],
    steps: ["Open **Documents & Certificates**, then the dealership.", "Upload registration papers, licences or agreements on its behalf, or press **Issue certificate** to award an achievement certificate.", "The dealership is notified and can download certificates from its own Documents page."],
    go: ["/procurement/documents"],
  },
  {
    id: "proc-dealer-hub", audience: PROC, q: "Where can I see everything about one dealership?", also: ["dealer hub", "dealer overview", "dealer orders", "dealer portal users"],
    steps: ["Open **Dealerships** and click the dealership (search by name, code or city).", "Tabs: **Overview** (portal users), **Stock**, **Orders**, **Ledger**, **Vouchers**, **Documents** — shown according to your permissions."],
    go: ["/procurement/dealers"],
  },
  {
    id: "proc-invoice", audience: PROC, q: "Where is the invoice for an order?", also: ["invoice", "download invoice", "order invoice"],
    steps: ["Open the order on **Dealer Orders** and use the invoice download. The invoice is posted to the dealer's ledger when the order is dispatched."],
    go: ["/procurement/orders"],
  },
];

/** Recipes for the audience; a head-office user who can open Procurement also gets the procurement recipes. */
export function howtosFor(audience: Audience, viewer?: Pick<Viewer, "can">) {
  const procurementToo = audience === "crm" && !!viewer?.can("procurement.view");
  return HOWTOS.filter((h) => h.audience.includes(audience) || (procurementToo && h.audience.includes("procurement")));
}

/** Markdown text of the recipes, for the model's reference material. */
export function howtosText(list: HowTo[]) {
  return list.map((h) => `**${h.q}**\n${h.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}${h.tip ? `\nTip: ${h.tip}` : ""}${h.go?.length ? `\nOpen: ${h.go.join(", ")}` : ""}`).join("\n\n");
}
