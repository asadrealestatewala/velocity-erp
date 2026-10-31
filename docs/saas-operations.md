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
* Platform console: separate sign-in and cookie (`yadea_platform`, path `/platform`, 8 h), roles OWNER / BILLING / SUPPORT / ANALYTICS, optional TOTP with replay protection and one-time recovery codes, rate-limited sign-in, append-only audit log, every sensitive change needs a written reason.
* Staff: optional TOTP on the Account page; administrators can remove a colleague's 2FA after a lost phone.
* Tokens (email confirmation, invitation, password reset) are stored hashed, expire, and are single use. Password reset answers are identical whether or not the email exists.
* Headers: `nosniff`, frame protection, strict referrer, HSTS in production; console and billing endpoints are `no-store` and `noindex`.
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

## 9. Known limits

* Placeholder plan limits and prices; no real tax handling; invoices are simple PDFs.
* One currency per company (PKR or USD), chosen at signup.
* No self-service data export button yet (export from each list, or take a backup).
* Legal pages are templates and need a lawyer.
* Email delivery needs Resend or SMTP; without it, emails are only logged and links are shown to the inviter.
