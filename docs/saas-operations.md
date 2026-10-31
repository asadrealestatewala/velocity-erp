# SaaS operations guide

How the multi-company platform works and how to run it. Everything here describes behaviour that exists in the code; items that need an account or secret from you are marked **You provide**.

## 1. How it is built

| Part | What it is |
| --- | --- |
| Control plane | A separate Postgres schema (`platform`) with its own Prisma schema (`prisma/platform/schema.prisma`) and generated client (`src/generated/platform`). Holds companies, plans and prices, subscriptions and their history, invoices, payments, refunds, coupons, platform staff, audit log. |
| Company database | Each company gets its **own PostgreSQL schema** (`t_<code>`) created by running the CRM's `prisma/migrations/*/migration.sql`. A company can instead be given its own database by storing an encrypted connection string (`Tenant.dbUrlEnc`). Companies never share tables. |
| Original install | Registered as the first workspace (`yadea`, schema `public`, `isLegacy`). Its data is not moved. It is never metered, locked or counted as a customer. |
| Request routing | `/w/<code>/…` is rewritten by the middleware and tags the request with the company; a cookie remembers it. `db` (`src/lib/db.ts`) is a proxy that sends every query to the current company's Prisma client. |
| Sign-in | Staff enter a **workspace code** (blank = the original workspace). An unknown code behaves exactly like a wrong password. |

Subdomains (`acme.yourdomain.com`) are **not** switched on: they need a domain you own and a wildcard DNS/Vercel setting. Workspace-code sign-in works without it.

## 2. First-time setup (new environment)

1. Set the variables in `.env.example` (section "SaaS platform"). `APP_SECRET` must be long and **never rotated casually**: it encrypts connection strings, Stripe keys and authenticator seeds.
2. `npm run platform:deploy` — creates the control-plane tables.
3. `npm run platform:bootstrap` — seeds plans, registers the original install as workspace `yadea`, creates the first platform OWNER from `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`.
4. `npm run tenants:migrate` — brings every company schema (including `public`) up to date. For a pooled connection (Supabase 6543) set `MIGRATE_DATABASE_URL` to the direct connection (5432).
5. Sign in at `/platform/login`, turn on two-factor under **My account**, then delete the two bootstrap variables.
6. In the console set: trial length, support contact, bank/wallet accounts, Stripe keys (optional), and review the **placeholder** plan limits and prices on *Plans & coupons*.

## 3. Every release

1. Deploy the code (`npm run build` generates both Prisma clients).
2. If the release added `prisma/migrations/*`: run `npm run tenants:migrate` (or *System → Apply pending migrations*). Companies that are behind show as "pending" under *System*.
3. If the release added `prisma/platform/migrations/*`: run `npm run platform:deploy` first.

Migrations must be additive (new tables/columns, nullable or defaulted) so a half-migrated fleet keeps working.

## 4. Subscriptions, in one page

* States: `PENDING` (no plan) → `TRIALING` → `ACTIVE` → `PAST_DUE` (grace period) → `EXPIRED`; `CANCELED` keeps access until the period ends; `SUSPENDED` blocks sign-in.
* **Read-only lock**: when a company is expired/past grace/maintenance, the database layer itself refuses writes (a guard on every write, not only in the UI). Sign-in bookkeeping, sessions, audit and password reset still work, so users can log in and pay.
* Every change goes through one function that also appends to `SubscriptionHistory`.
* The lifecycle job (`/api/jobs/run`, or `npm run platform:lifecycle`) ends trials, moves overdue plans to grace/expired and sends reminder emails once each. **Vercel Hobby runs cron once a day**; that is the resolution of trial/renewal changes unless you add a more frequent external trigger.
* Plan limits (staff logins, dealerships, contacts, storage) are enforced when staff create records. Public form submissions are never blocked by the contact limit.

## 5. Money

* Prices live in the control plane (`PlanPrice`, versioned). A price change affects new purchases and renewals; invoices keep what they charged.
* **Bank/wallet**: the customer sends money to one of your accounts and submits the transaction reference (unique per method). You confirm in *Payments & invoices*; confirming activates the plan and issues the invoice. Rejecting emails the reason.
* **Card (Stripe)**: hosted Checkout and customer portal over plain HTTPS; webhooks are signature-checked (5-minute tolerance) and processed once per event id. **You provide** the keys and Price ids, and must register the webhook URL shown in *Settings*. Test with Stripe test mode first. This integration has been tested against recorded/simulated events only, never against Stripe itself.
* **Refunds** are recorded separately and reduce "net". Recording a refund does not move money; refund the card in Stripe too.
* Reports: MRR = Σ active prices (yearly ÷ 12); ARR = MRR × 12 (a run-rate, not revenue); *collected* = invoices by paid date; *net* = collected − refunds. The original workspace is excluded.

## 6. Security model

* Tenant isolation: separate schemas, one Prisma client per company, and tests that create two real companies and check that neither can read the other (`tests/integration/tenancy.test.ts`).
* Platform console: separate sign-in and cookie (`yadea_platform`, path `/platform`, 8 h), roles OWNER / BILLING / SUPPORT / ANALYTICS, TOTP with replay protection and one-time recovery codes, rate-limited sign-in, append-only audit log, every sensitive change needs a written reason.
* Platform staff two-factor is **off until an owner turns it on** (an owner can only do that after enrolling their own two-factor on My account, so the change cannot lock them out) (Settings → Staff two-factor: all staff, owners and billing only, or off). Once required, anyone without it signs in normally but is taken to a set-up page (`/platform/enrol`) and cannot use the console until they finish, so nobody is locked out. Enrolled staff cannot turn it off while it is required. Company staff: optional TOTP on the Account page; administrators can remove a colleague's 2FA after a lost phone.
* Support "view as": OWNER and SUPPORT staff can open a workspace as one of its users (Workspaces → *View as user*). It needs a written reason, lasts 30 minutes, shows a banner with an *Exit view* button, is recorded in the platform audit log and in the company's own audit log, and is read-only: every database write is refused while the view cookie is present. Raw SQL and outbound side effects (email, webhooks) are not covered by that guard, so they are avoided by design on read paths.
* Data export and deletion (OWNER only, reason required, audited): a workspace page can download a full `.zip` (one JSON-lines file per table plus uploaded files; password hashes, 2FA secrets and sessions are never included), or `npm run tenants:export -- <code> out.zip` for very large workspaces. Deletion can only be scheduled for a suspended or cancelled workspace, needs the workspace code typed as confirmation, and waits the retention window (Settings, default 30 days). Reactivating or *Cancel deletion* stops it. When due, the lifecycle job erases uploaded files and the schema; the tenant row and its invoices/payments stay for accounting with personal fields cleared. Workspaces on their own database connection are never dropped (the customer owns that database).
* Health and logs: System shows the last run of each scheduled job (flagged overdue after 3× its cadence, e.g. when the scheduler stopped calling `/api/jobs/run`), server errors in the last 24 h, and failed or bounced emails; System → Logs lists errors (webhook handlers, jobs, unhandled request errors) and job runs. Errors are kept 30 days, job history 90.
* Dunning: when a renewal is missed the workspace goes past-due with a grace period (plan or Settings default). The owner is emailed on entering past-due and again on the same days-before-deadline as trial reminders (Settings → *Email reminders*). A failed Stripe card payment starts the grace period once (Stripe's retries don't extend it) and emails the owner once per Stripe invoice. Every refund gets a credit-note number (CN-00001) and PDF, available to platform staff and, for their own workspace, in Plan & billing.
* Announcements: *Announcements* (OWNER, SUPPORT) posts a notice at the top of every page in customers' workspaces, optionally limited to one plan or one workspace and an end date. Customers can dismiss it (per browser). Changes show within about a minute.
* Support tickets: *Support tickets* (OWNER, BILLING, SUPPORT) has views for open, mine, unassigned, overdue and done. Each ticket has an owner, a priority and a first-reply deadline (urgent 4 h, high 8 h, normal 24 h, low 72 h) that stops at the first public reply. Tickets come from three places: customers (*Support* in their workspace; replies appear there and by email), the Mail inbox (*Create ticket* on a thread, linked to the workspace) and staff (phone/WhatsApp). Internal notes are never shown to customers.
* Feature flags: *Feature flags* (OWNER, SUPPORT) switches a beta or optional feature on for everyone, for listed plans, for a stable percentage of workspaces, or per workspace (a reason-stamped exception on the workspace page, which always wins). Code checks a flag with `await isFeatureOn("key")` or `assertFeature("key")` from `server/platform/flags`; unknown or archived flags are off. Changes apply within about 15 seconds.
* Tokens (email confirmation, invitation, password reset) are stored hashed, expire, and are single use. Password reset answers are identical whether or not the email exists.
* Headers: `nosniff`, frame protection, strict referrer, HSTS in production; console and billing endpoints are `no-store` and `noindex`.
* **Network allowlist** (Settings → Where staff can sign in from): when set, sign-in and every console request from other addresses is refused. The list cannot be saved without your own current address. Break-glass: set `PLATFORM_IP_ALLOWLIST_OFF=1`, sign in, fix the list, remove the variable. The address is read from `x-forwarded-for`, which is only trustworthy behind your host's proxy (Vercel sets it).
* **Not done**: a Content-Security-Policy (needs testing against every page), per-company encryption keys, SSO/SAML.

## 7. Backups and restore

```
npm run platform:backup            # needs pg_dump and pg_restore on PATH; writes backups/<timestamp>/<schema>.dump
```

Schedule it at least daily. Each dump is checked with `pg_restore --list`, and the run is recorded: **System → Backups** shows the last good backup (red after 36 h or when none exists), workspaces missing from it, and the recent runs. If you rely on your provider's snapshots or an off-site copy, use *Record a backup taken elsewhere* so the page stays truthful. Also enable your database provider's point-in-time backups (Supabase: Pro plan).

**Restore one workspace** (do this on a scratch database first, and rehearse it before you need it):

1. Pick the newest good `backups/<ts>/<schema>.dump` (`t_<code>.dump` for a workspace, `platform.dump` for the control plane).
2. Put the workspace in *Maintenance mode* (System) so nobody writes during the restore.
3. Restore into a scratch schema and check row counts: `pg_restore --no-owner --schema=<schema> -d "<scratch connection string>" <file>`.
4. Restore over the live schema in a quiet period: `pg_restore --clean --if-exists --no-owner -d "<connection string>" <file>`.
5. Run *Apply pending migrations to all workspaces* (System) in case the dump is older than the code.
6. Turn maintenance mode off and open the workspace to confirm.

Uploaded files are not part of the dump: they live in the storage bucket (or `LOCAL_STORAGE_DIR`); enable versioning or back that up separately.

`platform:backup` has **not been run in this environment** against production data; test a restore before relying on it.

## 8. Runbooks

**A customer says they paid.** *Payments & invoices* → find the reference → compare with your bank/wallet → *Confirm received*. If the money is not there, *Reject* with a reason.

**Company is locked but should not be.** Open the company → check subscription and dates → *Record a payment received* (if they paid outside the app) or *Change plan (no payment)** with a reason, or *Extend* the trial. All of it is audited.

**Staff lost their phone (2FA).** Company admin: *Users → shield icon*. Platform staff: *Platform staff → Reset 2FA*.

**A migration failed for one company.** *System* shows the company and the error; fix the cause and run *Apply pending migrations* again (each migration is atomic and re-runnable).

**Maintenance.** *System → Maintenance mode* makes every company read-only (sign-in still works). Turn it off when done.

**Restore one company.** Restore its `.dump` into a scratch schema first, check it, then restore over the live schema in a quiet period.

## 8b. Growth and email campaigns

* **Growth** (`/platform/growth`, anyone with reports access): sign-up funnel (home → sign-up page → workspace → confirmed → came back → paid), weekly retention by sign-up cohort, and the demo-request inbox with *Mark handled*. Page views are counted for the public pages only and skip Do Not Track visitors, so the first two steps are indicative, not exact.
* **Usage tracking**: a workspace counts as active on a day when someone signs in to use it (one row per workspace per day). Retention is therefore empty before this release and fills in from deploy day onwards.
* **Campaigns** (`/platform/growth/campaigns`, owner only): save a draft, check the audience count, then send. Audiences: paying, on trial, trial ending within 7 days, payment overdue, inactive 30 days. Each email has a signed unsubscribe link; the link opens a confirmation page (so mail scanners cannot unsubscribe anyone). Unsubscribed workspaces are skipped from then on. Account, security and billing emails are never affected. Sending is claimed atomically, so a double click cannot send twice. Sends happen inside the request, so keep audiences to a few hundred; larger lists need a queue.

## 8c. Public status page

`/status` is public and needs no sign-in. It shows what the platform can verify itself (database reachable, maintenance mode) plus incidents staff post under *Status page* in the console (owner and support). It does not check Stripe, email delivery or any third party, and it cannot report on an outage that takes the whole site down, so host it elsewhere if you need that.

## 8d. Workspace list: CSV and bulk actions

*Workspaces* has **Download CSV** (owner only, follows the current search and status filter, up to 5,000 rows, audited because it contains owner emails) and **Extend trials for ticked** (owner and support). Only workspaces on a trial have a tick box; at most 50 at once, a written reason is required, each owner is emailed, and every workspace gets its own history and audit entry.

## 9. Known limits

* Placeholder plan limits and prices; no real tax handling; invoices are simple PDFs.
* One currency per company (PKR or USD), chosen at signup.
* No self-service data export button yet (export from each list, or take a backup).
* Legal pages are templates and need a lawyer.
* Email delivery needs Resend or SMTP; without it, emails are only logged and links are shown to the inviter.
