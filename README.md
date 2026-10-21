# YADEA CRM & Dealership Management Platform

A full-stack CRM for YADEA's central team, a secure per-dealership portal and a procurement & accounts portal. It captures leads from configurable public forms, routes test-drive requests to the outlet the customer selects, tracks every lead through a configurable pipeline, manages dealership applications from submission to onboarding, measures network performance with dashboards and light gamification — and runs the dealership operations side: showroom inventory (bikes and spare parts), customer orders that deduct stock, stock orders to YADEA procurement with delivery tracking, a dealer ledger with payment verification and Excel/PDF export, expense vouchers for tax records, shared documents and achievement certificates, per-dealership audit logs, a WhatsApp/email chat on every contact and an AI assistant with a knowledge base of the whole system.

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Prisma 6 · Zod · React Hook Form · Recharts · dnd-kit · Vitest · Playwright

---

## 1. Quick start (local development)

Prerequisites: **Node.js 20+** (tested on 24), **PostgreSQL 15+** (tested on 16).

```bash
npm install
cp .env.example .env              # then edit DATABASE_URL, APP_SECRET, CRON_SECRET
npx prisma migrate deploy         # create the schema
npm run db:seed                   # load fictional demo data
npm run dev                       # http://localhost:3000
```

> npm 11 blocks dependency install scripts by default. `package.json#allowScripts` already approves the ones that are required (Prisma engines, esbuild). If you install with another npm version and Prisma complains that its client isn't generated, run `npx prisma generate`.

| URL | Who |
|---|---|
| `/login` | Central CRM (YADEA staff) |
| `/portal/login` | Dealership portal (email **or mobile number**) |
| `/procurement/login` | Procurement & accounts portal (YADEA head office) |
| `/forms/test-drive` | Public test-drive booking |
| `/forms/general-inquiry` | Public customer inquiry |
| `/forms/dealership-application` | Public dealership / franchise application |

### Procurement department and Dealerships Heads

- **Procurement & Accounts** (central role) is the department responsible for supply: stock orders, dispatch, dealer ledgers and the whole **product catalogue — bike models and spare parts** (add/edit models and parts, set dealer prices) from *Procurement → Product Catalogue*. (Administrators can also manage models under CRM → Bike models; sales & CRM staff and dealerships cannot.)
- **Dealerships Head** (dealership role) oversees any set of dealerships, possibly across regions. Every dealership keeps its own outlet manager; a head is an *additional* person added to each dealership they oversee, so all those dealerships' leads, teams, stock orders, ledgers and audit logs appear in **one dealer portal** (list pages combine them; dealership-specific pages have a switcher). Anything they do — assigning leads to reps, stage changes, stock orders — runs with manager rights and is recorded in that dealership's audit log. Head office appoints heads from *CRM → Dealerships → (dealership) → Team → Add team member → "Dealerships head"*; repeat on each dealership they oversee. Adding a head to another dealership never changes their role.
- Placeholder accounts for both (4 regional heads — Punjab, Sindh, Islamabad Capital Territory, Khyber Pakhtunkhwa — and 2 procurement staff) are created with `npm run accounts:provision` (add `-- --cloud` to also create them in the cloud database). It is safe to repeat, prints one-time temporary passwords (everyone must change theirs at first sign-in) and the lists at the top of `scripts/provision-accounts.ts` define who gets which dealerships. Rename or replace the placeholder emails from Users & Permissions (procurement) or the dealership's Team panel (heads).

### Demo accounts — local seed only

The sign-in pages (`/login`, `/portal/login`) list all active demo accounts — click one to sign in. The panel appears **only when `APP_URL` points at localhost** (so it also works with the fast `npm run preview` production build, and never shows on a real deployment at a public domain). Hide it locally with `SHOW_DEMO_CREDENTIALS=false`. Production databases must never contain the demo accounts — the seed refuses to run there.

Every seeded account uses the password **`Yadea@Dev2026`** (override with the `SEED_PASSWORD` environment variable before seeding). These accounts and this password exist only in the local demo database. **Never seed demo data in production** (the seed script refuses to run when `NODE_ENV=production`).

| Email | Role | Where |
|---|---|---|
| `admin@yadea-demo.local` | Super Administrator | CRM |
| `management@yadea-demo.local` | YADEA Management (reviews applications) | CRM |
| `crm1@yadea-demo.local`, `crm2@yadea-demo.local` | Sales & CRM staff | CRM |
| `procurement@yadea-demo.local` (mobile `0300 0000201`) | Procurement & Accounts | Procurement portal |
| `manager.gulberg@yadea-demo.local` (mobile `0300 0000111`) | Dealership manager — Gulberg (Lahore) | Portal |
| `rep1.gulberg@yadea-demo.local`, `rep2.gulberg@…` | Sales reps — Gulberg | Portal |
| `manager.dha@yadea-demo.local`, `rep1.dha@…` | DHA Ride Hub (Lahore — second outlet in the same city) | Portal |
| `manager.clifton@yadea-demo.local`, `rep1/rep2.clifton@…` | Clifton EV Center (Karachi) | Portal |
| `manager.bluearea@yadea-demo.local`, `rep1.bluearea@…` | Blue Area Motors (Islamabad) | Portal |

Every dealership demo user also has a fictional mobile number (e.g. Gulberg manager `0300 0000111`, DHA manager `0300 0000121`, Clifton `0300 0000131`, Blue Area `0300 0000141`; reps follow the same pattern) so you can try signing in with a number.

The seed also creates: 4 provinces, 8 cities, 6 dealerships (active, pending/onboarding and suspended), 5 fictional bike models (one inactive), 64 contacts/leads across all stages (company-assigned and walk-in), test drives, tasks, notes, payments, 5 dealership applications in different review states, goals, achievements, and the three published forms. **All people, dealerships, phone numbers and bike models are fictional.** No official YADEA specifications or prices were invented — bike models are labelled "Seed example" in the UI.

---

## 2. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on :3000 (Turbopack — fast incremental compiles) |
| `npm run dev:webpack` | Development server with the classic webpack compiler |
| `npm run preview` | Production build + server on :3000 — **use this to demo or evaluate speed** |
| `npm run build` / `npm start` | Production build / server |
| `npx tsx scripts/bench.ts [url] [rounds] [email]` | Times every main page as a signed-in user |
| `npm run typecheck` | TypeScript check |
| `npx prisma migrate dev --name <change>` | Create a new migration (development) |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run db:seed` | Seed demo data into an **empty** database (includes the operations demo data below) |
| `npm run db:seed:operations` | Add the operations demo data (procurement user, stock, orders, ledger, vouchers, documents) to an **existing** demo database — idempotent |
| `npm run db:sync` | Apply the permission catalogue and default roles (e.g. the Procurement role) to an existing database. Also runs automatically when the server boots |
| `npm run db:reset` | Drop all data, re-migrate and re-seed (**development only — destroys data**) |
| `npm test` | Unit + integration tests (Vitest, uses `.env.test`) |
| `npm run test:e2e` | End-to-end workflows (Playwright; starts its own server on :3100 against the test DB) |
| `npm run jobs:run` | Run reminders, overdue alerts and email delivery once |
| `npm run forms:refresh-templates` | Re-publish the standard templates as a new version of the three default forms (non-destructive) |

### Tests

Tests use a **separate database** configured in `.env.test` (its `DATABASE_URL` must contain "test" — the suites refuse to run otherwise). Create it once (`CREATE DATABASE yadea_crm_test;`); migrations are applied automatically.

- **192 Vitest tests** (`tests/unit`, `tests/integration`) cover inventory, customer orders, stock orders and delivery receipt, the ledger and payment verification, Excel/PDF exports, vouchers and file access, dealership documents, dealership audit scoping, mobile-number sign-in, permission sync, WhatsApp/email chat (mocked providers), and the assistant (scripted model: scope, confirmation, expiry, prompt-injection and permission re-check cases; built-in guide mode: step-by-step answers, role-filtered links, live counts and stock/orders/balances, typos; and a drift guard that fails when the guide no longer matches the app's real routes and sidebar) as well as: form validation, conditional fields, upload validation, phone/email normalisation, the full public submission pipeline (city→outlet lookup, mismatched/inactive outlets, idempotency, duplicate handling, consent, schema versions, spam), dealership data isolation, assignment authority, privilege-escalation guards, CSV export scoping, private file access, stage history and loss reasons, tasks and gamification uniqueness, test-drive rules, payments, the application/onboarding workflow and the form builder.
- **13 Playwright workflows** (`tests/e2e`; the dev server compiles each route on first visit, so timeouts are generous). Operations workflows: mobile-number sign-in and a sale that deducts stock, spare-part order → approve → deliver → confirm receipt, payment with proof → verification → Excel/PDF download, vouchers with attachments, documents and certificates, dealership audit log, contact chat, assistant help mode. Original workflows: visitor books a test drive → lead appears only in the selected dealership's portal; staff manually assigns a lead; rep creates a walk-in lead and schedules a follow-up; manager reviews and approves an application and starts onboarding; admin builds and publishes a form. First run: `npx playwright install chromium`.

---

## 3. Environment variables

See `.env.example` (fully commented). Key ones:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_URL` | prod | Public base URL (links in emails) |
| `APP_SECRET` | yes | ≥32 random chars; signs form tokens and hashes IPs |
| `CRON_SECRET` | prod | Shared secret for `POST /api/jobs/run` |
| `APP_TIMEZONE` / `NEXT_PUBLIC_APP_TIMEZONE` | — | Business timezone (default `Asia/Karachi`) — test-drive slots, opening hours and all displayed dates |
| `STORAGE_DRIVER` | — | `local` (default, `./storage`) or `s3` |
| `S3_*` | if s3 | Bucket, region, credentials; `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE` for MinIO/R2/Wasabi |
| `MAX_UPLOAD_MB` | — | Per-file upload limit (default 10) |
| `SMTP_*`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | optional | Without `SMTP_HOST`, emails are recorded in the outbox as **SKIPPED** and only in-app notifications are delivered; the contact Chat tab says email is not connected |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | optional | Enables sending WhatsApp messages from the Chat tab (Meta WhatsApp Business Cloud API) |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | optional | Enables the inbound webhook `/api/webhooks/whatsapp` (signature verification + subscribe handshake) |
| `EMAIL_INBOUND_SECRET` | optional | Enables `/api/webhooks/email` (header `x-webhook-secret`) for inbound email from an inbound-parse / forwarding service |
| `ANTHROPIC_API_KEY` | optional | Turns the assistant from "help topics only" into the full AI assistant (answers, live data lookups, proposed changes). `ASSISTANT_MODEL` (default `claude-opus-5-5`), `ASSISTANT_EFFORT` (default `medium`) |

---

## 4. Production deployment

1. **Database:** managed PostgreSQL 15+. Run `npm run db:deploy` on every release (never `migrate dev`/`reset` in production). Enable automated daily backups + point-in-time recovery; test restores periodically.
2. **Build & run:** `npm ci && npm run build && npm start` (or a Node 20+ container). Put it behind HTTPS (session cookies are `Secure` when `NODE_ENV=production`). Ensure the proxy sets `X-Forwarded-For` (used for rate limiting).
3. **Secrets:** set `APP_SECRET`, `CRON_SECRET`, `DATABASE_URL`, S3 and SMTP credentials through your platform's secret manager — never commit them.
4. **Files:** set `STORAGE_DRIVER=s3` with a **private** bucket. Files are always served through `/api/files/:id`, which checks the requester's access to the owning record.
5. **Scheduled jobs:** call every 5–15 minutes:
   ```bash
   curl -X POST https://crm.example.com/api/jobs/run -H "x-cron-secret: $CRON_SECRET"
   ```
   (or `npm run jobs:run` from cron / Windows Task Scheduler). It sends task reminders, overdue-follow-up and upcoming-test-drive alerts (each only once), delivers queued emails and cleans expired sessions.
6. **First admin:** create the first Super Administrator with a one-off script or seed in a staging copy — do not use demo accounts. Remove/replace the seed bike models with official product data, upload form header photos, and point *Settings → Privacy* at the approved privacy policy (the bundled `/privacy` page is a placeholder template).
7. **Retention:** documents and leads are soft-deleted/archived (history is preserved). Define retention periods with your data-protection officer and implement scheduled purges accordingly.

---

## 5. Architecture

```
src/
  app/                    Next.js routes
    crm/…                 central CRM (layout enforces CENTRAL scope)
    portal/(app)/…        dealership portal (layout enforces DEALERSHIP scope + membership)
    forms/[slug]          public, schema-rendered forms
    api/public/…          option lookups (cities, outlets, models) + submission endpoint
    api/files/[id]        access-checked file downloads
    api/export/…          scoped CSV exports
    api/jobs/run          scheduler entry point
  server/
    authz.ts              permission guards + data scopes (single source of truth for isolation)
    access.ts             record-level access checks (out-of-scope = "not found")
    auth/session.ts       DB-backed sessions (SHA-256-hashed tokens, httpOnly cookies, bcrypt passwords)
    services/             business logic: assignment engine, leads/stages, form submission pipeline,
                          test drives, notifications + email outbox, gamification, analytics, jobs
    actions/              server actions (validate → authorise → service → audit)
    queries/              list/detail loaders composing the scopes
    storage/              storage abstraction (local + S3) with magic-byte validation
  lib/
    forms/schema.ts       versioned form schema + validator shared by builder, renderer and server
    permissions.ts        permission catalogue and default role grants
  components/             UI kit, shell, CRM/portal shared views
prisma/schema.prisma      ~40 models with FKs, uniques and indexes
```

### Key business rules

- **Isolation:** every protected query composes `leadScope` / `contactScope` / `childScope` / `taskScope` / `testDriveScope`. Dealership users only see leads of their dealership(s) (reps only their own unless the dealership enables "reps see all"). Notes, tasks, documents and payments carry the dealership context they were created in, so a contact shared by two dealerships never leaks the other's records. Out-of-scope IDs return "not found".
- **Assignment engine** (`services/assignment.ts`): the only code path that (re)assigns leads. Validates eligibility (active + `acceptsLeads` + rep membership), writes `LeadAssignmentHistory` (previous/new dealership & owner, type, reason, who, when), activity and notifications. Idempotency keys stop duplicate automatic assignments. Profile edits never reassign leads.
- **Form submission pipeline** (`services/form-submission.ts`): resolve published version → validate against that schema → consent → server-side city/outlet/model eligibility → idempotency & 24h duplicate detection → submission → match/create contact (normalised phone/email, never overwriting data) → lead → routing policy (selected outlet / city auto / manual) → booking, history, notifications — in **one transaction**. Each submission stores its schema version.
- **Test drives:** requests are never treated as confirmed; transitions are enforced; opening hours, notice period, horizon and slot capacity are validated; confirming/completing advances the lead stage.
- **Applications:** Submitted → Under review → Info required/Approved/Rejected/Withdrawn with audited history and required reasons. Approval does **not** create or activate anything: onboarding is a checklist (verify → create dealership (Pending) → invite manager → configure models → activate → enable lead assignment → notify).
- **Gamification:** points come only from business events (first contact, on-time follow-ups, stage advances, completed test drives, conversions) with a unique key per subject, so repeated or reversed actions never re-award. Leaderboards rank by a normalised score; portal users only see individual rankings for their own dealership.
- **Metric definitions** (shown in the UI): conversion = leads created in period now converted ÷ leads created; recognised sales = conversion values on converted leads; recorded payments = PAID payments (manual, unverified); first response = assignment → first outbound interaction.

### Operations modules (dealership inventory, orders, procurement, accounts)

- **Inventory** — each dealership keeps stock of *bike models* and *spare parts*. Every change goes through one function (`services/inventory.ts → adjustStock`) that locks the row, refuses to go below zero, and appends exactly one **append-only movement** (who, when, why, quantity after). A database `CHECK` constraint backs the "never negative" rule. Reaching the reorder level alerts the dealership managers once a day.
- **Customer orders** — a draft changes nothing; **confirming** deducts every line in one transaction (all or nothing; two simultaneous confirmations of the last unit cannot oversell); cancelling a confirmed order restores stock with a separate movement. Orders appear on the customer's activity timeline and download as PDF.
- **Stock orders to YADEA** — Received → Approved (procurement sets prices and an expected delivery date) → Packing → Dispatched → In transit → Delivered. The **invoice is raised once, at dispatch**. Delivery alone does *not* change the dealership's stock: the dealership **confirms receipt** with the quantities that arrived (short deliveries supported), and only then is stock added. Status can only move forward; every step is in the order history and notifies the dealership.
- **Ledger** — balance owed = Σ posted debits − Σ posted credits. A payment reported by a dealership requires **proof**, sits as *awaiting verification* and does **not** change the balance until procurement/accounts verifies (or rejects) it. A `CHECK` constraint forbids a row that is both a debit and a credit. Statements show a running balance and export to **Excel** and **PDF**; the all-dealer balance sheet exports to Excel for head office.
- **Expense vouchers** — date, category, payee, amount, tax, method and attachments of any type (**proof of payment, proof of invoice, invoice, receipt**); documents can be added later and are frozen once the voucher is reviewed. Excel export for tax records.
- **Documents & certificates** — one shared list per dealership: the dealership uploads its certificate of registration etc.; YADEA can upload on its behalf and **issues achievement certificates** (only YADEA can); both sides see the same list. Files are only served to the dealership's authorised users and to YADEA document administrators (`/api/files/[id]`).
- **Audit log for dealerships** — every operational action is tagged with its dealership, and managers read their own slice in the portal (head-office staff appear as "YADEA team", IP addresses are never shown). The central log gains a dealership filter.
- **Procurement role** — `PROCUREMENT` is a central role with its own portal and sign-in. Dealership-only permissions (inventory, orders, payments, vouchers) are never granted to head-office roles; head office acts on dealer data through the procurement pages.
- **Sign-in with mobile number** — dealership users can sign in with email or mobile number (any common format, normalised; one number per account). Failed attempts are audited with only the last four digits, and the error for an unknown number is identical to a wrong password.

### WhatsApp / email chat

The **Chat** tab on a contact shows WhatsApp and email conversations. When the integration is connected, messages are sent through the provider, a row is stored *before* sending and only becomes **Sent** when the provider accepts it (failures show the provider's reason); inbound messages, delivery and read receipts arrive by webhook (idempotent, signature-checked). WhatsApp's 24-hour rule is enforced: free text only within 24 hours of the customer's last message. When a channel is **not connected** the tab says so and offers **Open WhatsApp** (wa.me) plus **Log a conversation** — logged items are labelled "Logged manually" and never shown as sent by the CRM. Conversations are tagged with the dealership like notes are, so a dealership never sees central-only chats.

Setting up WhatsApp: create a Meta WhatsApp Business app, put the phone-number id and a permanent access token in `.env`, register `https://<domain>/api/webhooks/whatsapp` as the webhook with your verify token, subscribe to `messages`, and set `WHATSAPP_APP_SECRET`. Template (outbound-first) messages are not implemented. Inbound email: point an inbound-parse service (Postmark, SendGrid, a mail rule…) at `POST /api/webhooks/email` with header `x-webhook-secret`; body `{ "from", "subject", "text", "messageId" }` (Postmark's native payload also works).

### AI assistant

A floating assistant in all three portals. It has the **whole platform guide** built in (audience-specific), plus administrator-written entries from **CRM → Knowledge base**. With `ANTHROPIC_API_KEY` set it uses Claude (default `claude-opus-5-5`, prompt-cached) with **tools that read live data limited to what the signed-in user may see** (any record via `query_data` — counts, lists, sums, breakdowns — plus contacts, leads, pipeline, tasks, test drives, stock, stock orders, ledger, catalogue, dashboard numbers) and tools that **propose** changes (create contacts incl. bulk lists, add a note or task, move a lead between open stages, assign a lead, adjust stock, place a stock order, draft a customer order, add a spare part / bike model, set bike prices, add a knowledge entry). **Nothing is written until the user presses Confirm** on a card that shows exactly what will happen; the summary is generated by code, not by the model. Confirmation claims the proposal atomically (once only, expires after 20 minutes), re-checks the user's permissions, runs through the *same server actions the UI uses* (so validation, RBAC and audit apply) and is audited. Tool results are treated as untrusted data. Writes require `assistant.write` plus the permission of the underlying action.

**What it knows ("training").** Claude is not fine-tuned on this app; instead the assistant is given the app's complete knowledge on every request, which is the standard and far more maintainable approach. The knowledge lives in `src/server/assistant/`: `sitemap.ts` (every screen of all three workspaces — where it is in the sidebar, what is on it, what you can do there), `howtos.ts` (step-by-step recipes), `glossary.ts` (what every status and term means), `guide.ts` (concepts: roles, ledger, stock rules, exports, uploads…) plus the administrator-written **Knowledge base** entries. All of it is filtered to the screens the signed-in user's role can actually open, and `tests/unit/assistant-knowledge.test.ts` fails if a screen is added, renamed or moved in the app without the guide being updated.

**Without an API key** the assistant runs in **built-in guide mode**: it matches the question (typos tolerated) against the same knowledge, answers with step-by-step instructions and clickable links, gives a full tour of the app on request, and can show **live numbers** (low stock, open stock orders, overdue deliveries, balances owed, unassigned leads, tasks, test drives, prices, pipeline counts) through the same permission-checked read tools, and it understands plain questions about the data — *"how many customers have an email?"*, *"leads per city this month"*, *"total value of stock orders per dealership"*, *"contacts named Ali"*, *"list urgent stock orders"* — by turning them into a structured query (`nl-query.ts` → `data-query.ts`). It is deliberately strict: every phrase of the question must become a filter; if part of it can't be applied it says exactly which part instead of returning a number that quietly ignores it, and anything it can't count it says so rather than guessing. It never changes data and cannot hold an open-ended conversation — that needs the AI key.

**The data engine** (`src/server/assistant/data-query.ts`) is what lets the AI answer *any* question about the data. It is a read-only query layer over a whitelist of entities and fields (contacts, leads, test drives, tasks, activities, dealerships, stock orders, customer orders, inventory, ledger, vouchers, applications, submissions, users, catalogue, audit log): filters, count/sum/average/min/max, group-by (with date buckets), lists. There is no raw SQL, every query is AND-ed with the same access scope the rest of the app uses (a dealership can't reach another dealership's records, a role without ledger access can't query the ledger, a dealership never sees which head-office user acted in its audit log), sensitive columns aren't queryable at all, and results are capped. The AI uses it as the `query_data` tool.

**Connecting the AI** (what makes it answer open-ended questions and propose changes). Two ways, set in the server's `.env` (never in chat, source code or git), then restart the app and run `npm run assistant:check` — it sends one tiny request and reports whether the connection works (it never prints a key). The assistant header then reads "AI connected" and **CRM → Knowledge base** shows the same status.

1. **Claude (Anthropic):** `ANTHROPIC_API_KEY="…"` (create a key in the Anthropic Console; usage is billed).
2. **Any OpenAI-compatible service with tool calling** — e.g. Google Gemini's free tier, Groq, OpenRouter, OpenAI, or a local Ollama: `ASSISTANT_PROVIDER="openai-compatible"`, `ASSISTANT_BASE_URL`, `ASSISTANT_MODEL`, `ASSISTANT_API_KEY` (see `.env.example` for the Gemini address). The assistant's permissions, tools and confirm-before-saving rules are identical whichever model sits behind it (adapter: `src/server/assistant/openai-compat.ts`).

**Privacy:** the connected service receives the question, the app guide and the customer/dealer records the assistant looks up to answer it. Choose a plan whose terms fit that data; free tiers of some services may use requests to improve their products. Small local models usually need a large context window (the guide is ~15k tokens) and are weaker at tool calling.

### Security

Server-side authorisation on every page, action and route; RBAC with an editable permission matrix (no self-escalation: users can't edit their own role or its permissions, only Super Admins grant Super Admin, nobody grants permissions they don't hold); bcrypt passwords; hashed session tokens with sliding expiry and invalidation on password change/deactivation; forced change of temporary passwords; DB-backed rate limiting on login, public submissions and lookups; honeypot + signed render token against bots; magic-byte upload validation, private storage and sanitised filenames; CSV formula-injection escaping; Zod validation everywhere; React output escaping; security headers; audit log for sign-ins, assignments, exports, permission/settings changes and more. Server actions are protected by Next.js's same-origin checks (CSRF).

---

## 6. Implemented features

Central CRM: dashboard (15 KPIs with period comparison, trends, source/stage/city/dealership breakdowns, origin split, loss reasons, test-drive trend, dealership performance, unassigned queue, recent activity, upcoming follow-ups, filters) · contacts (search, 14 combinable filters, sortable, paginated, mobile cards, CSV export, create/edit with duplicate detection, archive/restore) · contact profile (header + quick actions, general/additional info, custom fields, test drives, stage & assignment history, submissions, five-tab panel: activity, tasks, notes, documents, payments; avatar upload) · Kanban + table pipeline with drag-and-drop (pointer & keyboard) · form submissions (review, link, create contact/lead, assign, spam, duplicates, schema version) · form builder (16 field types, conditional visibility, live DB option sources, CRM mapping, validation, theme/header image, routing policy, preview, publish/unpublish/duplicate, version history) · test drives (list & month calendar, status workflow, rep assignment) · dealerships (CRUD, status, lead-assignment activation, team, models, hours, slot capacity, change history, performance) · applications (review, reviewer, notes, documents, onboarding) · bike models · tasks · reports & analytics with CSV export · leaderboard · notifications (read/unread, preferences) · users, roles & permission matrix, departments · settings (stages, loss reasons, sources, cities/provinces, custom fields, privacy & consent, duplicate rules, gamification points, achievements, goals, booking rules, notifications, system status, run jobs) · audit log.

Operations (new): dealership **Inventory**, **Customer orders**, **Stock orders**, **Account ledger** (Excel/PDF), **Expense vouchers**, **Documents**, **Audit log**; **Procurement portal** — dashboard (orders received / awaiting action / approved / delivered / overdue, payments to verify, outstanding balances), dealer orders, dispatch board, product catalogue and dealer prices, dealer stock, dealership hubs (stock, orders, ledger, vouchers, documents), ledgers & payment verification, vouchers review, documents & certificates; contact **Chat** (WhatsApp/email); **AI assistant** and **Knowledge base**.

Dealership portal: dashboard (points, KPIs, company vs walk-in, goals with progress bars, badges, celebrations, new-lead queue, upcoming test drives, recent assignments, team activity) · My / All / Company-assigned / Walk-in leads with inline stage and rep assignment · walk-in creation · pipeline · contacts & profiles · test drives · tasks · team performance & team management (managers) · leaderboard · analytics · notifications · dealership settings · account.

## 7. Integrations status

| Integration | Status |
|---|---|
| PostgreSQL | ✅ Implemented and tested |
| Local file storage | ✅ Implemented and tested |
| S3-compatible storage | ⚙️ Implemented (`@aws-sdk/client-s3`); **not tested against a real bucket** (no credentials supplied) |
| SMTP email | ⚙️ Implemented via outbox + nodemailer; **not tested against a real SMTP server**. Without SMTP, messages are marked SKIPPED — never reported as sent |
| WhatsApp (Meta Cloud API) | ⚙️ Implemented (send, inbound webhook, receipts); **not tested against a live WhatsApp Business account** — tests use a mocked provider. Without credentials the Chat tab is "not connected" and conversations are logged manually |
| Inbound email webhook | ⚙️ Implemented (generic JSON + Postmark shape); **not tested against a real provider** |
| AI assistant (Anthropic API) | ⚙️ Implemented with a replaceable model adapter; tested with a scripted model, **not run against the live API** in this environment. Without `ANTHROPIC_API_KEY` it answers from the built-in guide only |
| SMS sending | ❌ Not integrated |
| Payment provider | ❌ Not integrated — payments are recorded manually and flagged as unverified |

## 8. Performance

Development mode compiles each page on first visit and runs React's extra development checks on every request, so it is several times slower than production. On the reference machine (2-core i5-6300U, 8 GB RAM) a production build serves CRM pages in a median of ~90 ms (portal ~70 ms, slowest: dashboard ~250 ms) versus 0.4–3.5 s warm and 5–20 s on first visit in webpack dev mode. Measure with `scripts/bench.ts`.

Built-in optimisations: route-level loading skeletons (instant feedback on navigation), Recharts loaded lazily (dashboard JS 228 kB → 126 kB), per-row dialogs mounted only when opened, parallel database queries per page, and indexes on every list filter. Keep memory free on small machines — each running Next.js server uses several hundred MB.

### Design system, motion and the sign-in scene

- **Tokens** live in `src/app/globals.css` (`@theme`): YADEA orange (`brand-*`, 600+ for text/buttons for AA contrast), graphite (`navy-*` — the legacy name is kept so every consumer re-themes at once) and a sparing electric teal (`volt-*`). Motion tokens: `--ease-out-expo`, `--ease-soft`; utilities `.reveal`, `.stagger`, `.page-enter`, `.skeleton`, `.card-hover`.
- **Reduced motion:** a global `prefers-reduced-motion` rule removes animation/transition time; the count-up figures and progress bars show their real values immediately, and sign-in navigates with no scene delay.
- **Sign-in scene** (`components/auth/auth-scene.tsx`, `login-stage.tsx`, `login-form.tsx`): the supplied YADEA G5S photo (`public/brand/yadea-g5s.webp`, background already transparent) glides in on a graphite stage. The scene phase mirrors the real request — `idle → submitting → success | error`. `success` is set only when `loginWithResultAction` returns `ok: true` (the session already exists); invalid credentials, rate limits and network failures show the error and never play the success scene. The form posts to the same single `authenticate()` path as the classic `loginAction` (still used as the no-JavaScript fallback). Because it is one flat photograph the motion is image-based (glide, reflection, light, streaks); independent wheel rotation or true 3D would need layered or 3D source assets.
- **Dashboard gamification** uses only recorded rows: `server/services/progress.ts` derives points, the day streak, week-over-week change, rank and next-badge progress from `GamificationEvent`/`UserAchievement`; goals come from the `Goal` table via `goalProgress`.

## 9. Known limitations & assumptions

- Dashboards aggregate trend data in the application layer; fine for tens of thousands of leads per period — move to SQL aggregation / materialised views at larger scale. Search uses `ILIKE`; add `pg_trgm` indexes for very large contact tables.
- An out-of-scope record renders the "not found" page, but because the layout has already streamed, the HTTP status can be 200 rather than 404. No record data is sent.
- Files uploaded with a submission that later fails validation inside the transaction can remain orphaned in storage; a periodic orphan-cleanup job is not yet implemented.
- One business timezone per deployment (`APP_TIMEZONE`).
- The rate limiter trusts `X-Forwarded-For`; configure your proxy to set it and strip client-supplied values.
- Operations amounts are in PKR. The demo orders, invoices and payments use round numbers to make the demo readable — they are **not YADEA prices**; catalogue prices stay empty until an administrator enters them. The Ruibin L / Ruibin S / GT70 / Keeness models are seeded by name only.
- Invoices are produced as a PDF per stock order and numbered by ledger entry (`INV-n`); there is no tax-invoice numbering scheme or tax computation — adapt to your jurisdiction's rules.
- WhatsApp template messages (outbound-first) are not implemented; free text works only inside the 24-hour window. Delivery receipts depend on the webhook being reachable from Meta.
- The assistant keeps its conversation in the browser tab (session storage) — only proposals are stored server-side.
- ESLint is not configured (TypeScript strict mode and the production build type-check are).
- Dependencies are pinned to proven majors (Next 15, Prisma 6, Zod 3, Recharts 2) rather than the newest majors.
- `public/brand/hero-dealership.jpg`, `public/brand/hero-test-drive.jpg` and `tests/support/mock-session.ts` are untracked leftovers (unused) and can be deleted.
- A consent checkbox alone does not establish legal compliance — have the policy, wording and retention periods reviewed.
