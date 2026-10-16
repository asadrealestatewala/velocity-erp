# YADEA CRM & Dealership Management Platform

A full-stack CRM for YADEA's central team and a secure, per-dealership portal. It captures leads from configurable public forms, routes test-drive requests to the outlet the customer selects, tracks every lead through a configurable pipeline, manages dealership applications from submission to onboarding, and measures network performance with dashboards and light gamification.

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
| `/portal/login` | Dealership portal |
| `/forms/test-drive` | Public test-drive booking |
| `/forms/general-inquiry` | Public customer inquiry |
| `/forms/dealership-application` | Public dealership / franchise application |

### Demo accounts — local seed only

Every seeded account uses the password **`Yadea@Dev2026`** (override with the `SEED_PASSWORD` environment variable before seeding). These accounts and this password exist only in the local demo database. **Never seed demo data in production** (the seed script refuses to run when `NODE_ENV=production`).

| Email | Role | Where |
|---|---|---|
| `admin@yadea-demo.local` | Super Administrator | CRM |
| `management@yadea-demo.local` | YADEA Management (reviews applications) | CRM |
| `crm1@yadea-demo.local`, `crm2@yadea-demo.local` | Sales & CRM staff | CRM |
| `manager.gulberg@yadea-demo.local` | Dealership manager — Gulberg (Lahore) | Portal |
| `rep1.gulberg@yadea-demo.local`, `rep2.gulberg@…` | Sales reps — Gulberg | Portal |
| `manager.dha@yadea-demo.local`, `rep1.dha@…` | DHA Ride Hub (Lahore — second outlet in the same city) | Portal |
| `manager.clifton@yadea-demo.local`, `rep1/rep2.clifton@…` | Clifton EV Center (Karachi) | Portal |
| `manager.bluearea@yadea-demo.local`, `rep1.bluearea@…` | Blue Area Motors (Islamabad) | Portal |

The seed also creates: 4 provinces, 8 cities, 6 dealerships (active, pending/onboarding and suspended), 5 fictional bike models (one inactive), 64 contacts/leads across all stages (company-assigned and walk-in), test drives, tasks, notes, payments, 5 dealership applications in different review states, goals, achievements, and the three published forms. **All people, dealerships, phone numbers and bike models are fictional.** No official YADEA specifications or prices were invented — bike models are labelled "Seed example" in the UI.

---

## 2. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript check |
| `npx prisma migrate dev --name <change>` | Create a new migration (development) |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run db:seed` | Seed demo data into an **empty** database |
| `npm run db:reset` | Drop all data, re-migrate and re-seed (**development only — destroys data**) |
| `npm test` | Unit + integration tests (Vitest, uses `.env.test`) |
| `npm run test:e2e` | End-to-end workflows (Playwright; starts its own server on :3100 against the test DB) |
| `npm run jobs:run` | Run reminders, overdue alerts and email delivery once |
| `npm run forms:refresh-templates` | Re-publish the standard templates as a new version of the three default forms (non-destructive) |

### Tests

Tests use a **separate database** configured in `.env.test` (its `DATABASE_URL` must contain "test" — the suites refuse to run otherwise). Create it once (`CREATE DATABASE yadea_crm_test;`); migrations are applied automatically.

- **61+ Vitest tests** (`tests/unit`, `tests/integration`) cover form validation, conditional fields, upload validation, phone/email normalisation, the full public submission pipeline (city→outlet lookup, mismatched/inactive outlets, idempotency, duplicate handling, consent, schema versions, spam), dealership data isolation, assignment authority, privilege-escalation guards, CSV export scoping, private file access, stage history and loss reasons, tasks and gamification uniqueness, test-drive rules, payments, the application/onboarding workflow and the form builder.
- **5 Playwright workflows** (`tests/e2e`): visitor books a test drive → lead appears only in the selected dealership's portal; staff manually assigns a lead; rep creates a walk-in lead and schedules a follow-up; manager reviews and approves an application and starts onboarding; admin builds and publishes a form. First run: `npx playwright install chromium`.

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
| `SMTP_*`, `EMAIL_FROM` | optional | Without `SMTP_HOST`, emails are recorded in the outbox as **SKIPPED** and only in-app notifications are delivered |

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

### Security

Server-side authorisation on every page, action and route; RBAC with an editable permission matrix (no self-escalation: users can't edit their own role or its permissions, only Super Admins grant Super Admin, nobody grants permissions they don't hold); bcrypt passwords; hashed session tokens with sliding expiry and invalidation on password change/deactivation; forced change of temporary passwords; DB-backed rate limiting on login, public submissions and lookups; honeypot + signed render token against bots; magic-byte upload validation, private storage and sanitised filenames; CSV formula-injection escaping; Zod validation everywhere; React output escaping; security headers; audit log for sign-ins, assignments, exports, permission/settings changes and more. Server actions are protected by Next.js's same-origin checks (CSRF).

---

## 6. Implemented features

Central CRM: dashboard (15 KPIs with period comparison, trends, source/stage/city/dealership breakdowns, origin split, loss reasons, test-drive trend, dealership performance, unassigned queue, recent activity, upcoming follow-ups, filters) · contacts (search, 14 combinable filters, sortable, paginated, mobile cards, CSV export, create/edit with duplicate detection, archive/restore) · contact profile (header + quick actions, general/additional info, custom fields, test drives, stage & assignment history, submissions, five-tab panel: activity, tasks, notes, documents, payments; avatar upload) · Kanban + table pipeline with drag-and-drop (pointer & keyboard) · form submissions (review, link, create contact/lead, assign, spam, duplicates, schema version) · form builder (16 field types, conditional visibility, live DB option sources, CRM mapping, validation, theme/header image, routing policy, preview, publish/unpublish/duplicate, version history) · test drives (list & month calendar, status workflow, rep assignment) · dealerships (CRUD, status, lead-assignment activation, team, models, hours, slot capacity, change history, performance) · applications (review, reviewer, notes, documents, onboarding) · bike models · tasks · reports & analytics with CSV export · leaderboard · notifications (read/unread, preferences) · users, roles & permission matrix, departments · settings (stages, loss reasons, sources, cities/provinces, custom fields, privacy & consent, duplicate rules, gamification points, achievements, goals, booking rules, notifications, system status, run jobs) · audit log.

Dealership portal: dashboard (points, KPIs, company vs walk-in, goals with progress bars, badges, celebrations, new-lead queue, upcoming test drives, recent assignments, team activity) · My / All / Company-assigned / Walk-in leads with inline stage and rep assignment · walk-in creation · pipeline · contacts & profiles · test drives · tasks · team performance & team management (managers) · leaderboard · analytics · notifications · dealership settings · account.

## 7. Integrations status

| Integration | Status |
|---|---|
| PostgreSQL | ✅ Implemented and tested |
| Local file storage | ✅ Implemented and tested |
| S3-compatible storage | ⚙️ Implemented (`@aws-sdk/client-s3`); **not tested against a real bucket** (no credentials supplied) |
| SMTP email | ⚙️ Implemented via outbox + nodemailer; **not tested against a real SMTP server**. Without SMTP, messages are marked SKIPPED — never reported as sent |
| SMS / WhatsApp sending | ❌ Not integrated — interactions are logged manually on the timeline |
| Payment provider | ❌ Not integrated — payments are recorded manually and flagged as unverified |

## 8. Known limitations & assumptions

- Dashboards aggregate trend data in the application layer; fine for tens of thousands of leads per period — move to SQL aggregation / materialised views at larger scale. Search uses `ILIKE`; add `pg_trgm` indexes for very large contact tables.
- An out-of-scope record renders the "not found" page, but because the layout has already streamed, the HTTP status can be 200 rather than 404. No record data is sent.
- Files uploaded with a submission that later fails validation inside the transaction can remain orphaned in storage; a periodic orphan-cleanup job is not yet implemented.
- One business timezone per deployment (`APP_TIMEZONE`).
- The rate limiter trusts `X-Forwarded-For`; configure your proxy to set it and strip client-supplied values.
- ESLint is not configured (TypeScript strict mode and the production build type-check are).
- Dependencies are pinned to proven majors (Next 15, Prisma 6, Zod 3, Recharts 2) rather than the newest majors.
- `public/brand/hero-dealership.jpg` and `hero-test-drive.jpg` are unused crops from the reference screenshots and can be deleted.
- A consent checkbox alone does not establish legal compliance — have the policy, wording and retention periods reviewed.
