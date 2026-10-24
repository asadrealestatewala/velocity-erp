# YADEA CRM → multi-tenant SaaS: workflow analysis and plan

Source studied: the public repository `asadrealestatewala/Agentify-ERP` (docs: SAAS_PLAN, BILLING, SUPER_ADMIN_PLAN, README "Multi-tenant SaaS mode").
It has **no licence**, so none of its code is copied: only the *workflow and product concepts* are re-implemented here from scratch, on this project's stack
(Next.js 15, Prisma, PostgreSQL/Supabase, Vercel).

## 1. The SaaS workflow in Agentify ERP

| # | Stage | What it does |
|---|-------|--------------|
| 1 | **Control plane** | A platform database lists tenants (workspaces), plans, prices, subscriptions, invoices, payments, platform admins and an append-only audit log. |
| 2 | **Tenant routing + isolation** | `<slug>.<base-domain>` (or a custom domain) selects the workspace; every request runs inside that tenant; login tokens carry the tenant id and are rejected elsewhere; uploads are namespaced per tenant. Cross-tenant tests prove isolation. |
| 3 | **Signup → provisioning** | Public `/signup` creates a workspace with base configuration (no demo data), an owner account, a welcome email with a one-time confirm link (owner cannot invite people until confirmed). |
| 4 | **Trial** | 7-day UTC trial, one trial per owner email (hashed), reminders at 3 / 1 / 0 days, console controls to extend/shorten/end/revoke (reason required). |
| 5 | **Accounts** | Invitations (one-time link, 7 days, only a hash stored), forgot-password (same answer whether or not the account exists; link works once, signs out everywhere), optional TOTP 2FA with recovery codes. |
| 6 | **Plans & entitlements** | Plans/prices live in the database (versioned); limits per plan (users, projects, storage, modules, API access); add-ons, coupons, setup fees. Enforced **server-side** by a billing guard (HTTP 402 with a reason code). |
| 7 | **Subscription lifecycle** | States: trialing → active → past_due (grace) → canceled/expired; a lifecycle job moves states, sends reminders, and records every change in an append-only history. Non-payment makes the workspace **read-only**; nothing is ever deleted. |
| 8 | **Payments** | Stripe hosted checkout + customer portal + signed, idempotent webhooks; local bank/wallet transfers confirmed by an operator (reference usable once); manual activation with a reason; refunds as separate records; invoices. |
| 9 | **Platform console** | `/platform`: executive dashboard (MRR, ARR, collected, refunds, conversion, churn), workspaces, plans, payments, reports/exports, roles (Owner, Billing, Support, Analytics), audit with IP/reason, sessions, backups, health, maintenance mode. |
| 10 | **Marketing site** | Landing page, pricing read live from the plans table, FAQ, signup, legal pages, SEO (meta, robots, sitemap), consent-based analytics. |
| 11 | **Operations** | Scheduled backups, rate limits, hardening checks, handover docs. |

## 2. Mapping to YADEA CRM

| Agentify | YADEA CRM equivalent | Notes |
|----------|----------------------|-------|
| Database per tenant (SQLite) | **Shared PostgreSQL with a `tenantId` on every business table**, enforced by a Prisma client extension (auto-filter + auto-stamp) and covered by cross-tenant tests | Database-per-tenant does not fit Supabase + serverless; a shared DB scales and keeps one migration path. Postgres row-level security can be added later as defence in depth. |
| `AsyncLocalStorage` tenant context | Tenant resolved in middleware (host/subdomain, or workspace code at sign-in) and stored on the session; used by the Prisma extension | Sessions already exist (`Session` table) — add `tenantId`. |
| Existing install = tenant #1 | **YADEA's current live data becomes the first tenant** (`yadea`), migrated additively; nothing deleted or renumbered | Same pattern Agentify used for its legacy install. |
| Per-tenant uploads | Storage keys prefixed `tenants/<id>/…` (Supabase bucket / local disk) | |
| Signup / invite / reset / email confirm | Same flows, re-built on the existing auth (`Session`, argon/bcrypt hashing, `rateLimit`) | Needs an email provider key (e.g. Resend); without it links are logged. |
| Plans & limits | Limits that make sense for a dealer-network CRM: staff users, dealerships, contacts, forms, storage, assistant usage, procurement module, API/webhooks | Prices are placeholders until you set them. |
| Billing guard / read-only lock | Wrapper used by server actions + API routes (`402 billing_locked` / `*_limit`) | |
| Lifecycle job | Existing cron route (`/api/jobs/run`) runs the lifecycle for all tenants | **Vercel Hobby cron is daily only** — hourly precision needs Pro or an external scheduler. |
| Stripe + local PK methods | Same: Stripe Checkout/portal/webhook, plus Raast/Easypaisa/JazzCash/bank transfer with operator approval | **Needs your Stripe keys** (and real payment-account details). |
| Platform console | New `/platform` area with its own admin table, roles, 2FA, audit | Separate from tenant users. |
| Landing/pricing/legal/SEO | `/` becomes a marketing page when no tenant is resolved; pricing from DB | |
| Subdomains `<slug>.domain` | Wildcard subdomain needs **your own domain** (not `*.vercel.app`) | Interim option: workspace code on the sign-in page. |

## 3. Phases (each ends runnable, tested, and deployed to a preview first)

0. **Plan** (this document).
1. **Tenancy foundation:** `Tenant` model, `tenantId` on all business tables (additive migration, backfilled to tenant `yadea`), Prisma isolation extension, tenant-aware sessions/uploads/jobs/assistant, cross-tenant leak tests. *Highest risk — done first and verified before anything else.*
2. **Signup & accounts:** `/signup`, provisioning with base data, email confirmation, invitations, forgot-password, trial claim per owner email.
3. **Plans, trial & lifecycle:** plans/prices tables, limits + billing guard, subscription states and history, lifecycle job, reminders, read-only mode, billing banner.
4. **Payments:** Stripe (checkout, portal, webhooks), local bank/wallet submissions with operator approval, manual activation, refunds, invoices (PDF).
5. **Platform console:** admin accounts/roles/2FA, workspaces, plans, payments, MRR/ARR/collections metrics, audit, health, maintenance mode.
6. **Marketing site:** landing, pricing, FAQ, legal templates, demo form, SEO, consent-based analytics.
7. **Hardening:** backups, rate limits, 2FA for tenant staff, penetration-style tests, runbooks.

## 4. Risks and non-goals

* Every query in the app must be tenant-scoped; the Prisma extension plus tests are the safety net — a missed table is a data leak, so Phase 1 is gated by an automated model-coverage test.
* The live Supabase database is migrated with **additive** SQL only; a backup/export is taken first.
* No payment goes live without your Stripe keys; prices/limits are placeholders; legal pages are templates to be reviewed by a lawyer.
* Not planned: SMS providers, IP allow-listing, workspace impersonation, tax engine.
