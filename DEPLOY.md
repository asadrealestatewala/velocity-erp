# Deploying to Vercel + Supabase

The app runs on **Vercel** (Next.js), its database is **Supabase Postgres**, and uploaded files live in a private **Supabase Storage** bucket (`yadea-files`, S3-compatible).

## One-time setup

1. **Supabase project** — created (`yadea-crm`, Singapore). In the dashboard set the database password (Project Settings → Database) and copy the two connection strings (Connect → ORMs → Prisma): *Transaction pooler* (port 6543) and *Session pooler* (port 5432).
2. **Storage keys** — Storage → S3 connection → *New access key*. Note the endpoint, region and the key pair.
3. **`.env.cloud`** — fill the `FILL-IN` lines. The file is git-ignored; never paste its contents into chat or commit it.
4. **Create tables and demo data** (once, from your computer):
   ```bash
   # load .env.cloud, then point Prisma at the session pooler for the migration
   npm run cloud:setup
   ```
   This runs `prisma migrate deploy` (creates every table, with the history Prisma needs for future migrations) and seeds the demo data.
5. **Vercel** — import the GitHub repo `Afaqurrehman/yadea-crm`, set every variable from `.env.cloud` (except `MIGRATE_DATABASE_URL`) in Project → Settings → Environment Variables, deploy. Then set `APP_URL` to the site address and redeploy.

## Notes

- **Migrations** are never run by the Vercel build. After adding a migration: `npm run cloud:setup -- --migrate-only` (or `prisma migrate deploy` with `MIGRATE_DATABASE_URL`).
- **Scheduled jobs** (reminders, overdue alerts, email) run from `vercel.json` once a day at 03:00 UTC through `GET /api/jobs/run` with `Authorization: Bearer $CRON_SECRET` (Vercel adds this header automatically). Vercel's free plan only allows daily crons; for every 5–15 minutes use a paid plan or an external scheduler calling `POST /api/jobs/run` with header `x-cron-secret`.
- **Files**: `STORAGE_DRIVER=s3` sends uploads to the private bucket; downloads still go through the app's permission-checked `/api/files/[id]` route.
- **Demo credentials** are for demo data only. Change every password (Users & Permissions) before real use, and keep `SHOW_DEMO_CREDENTIALS=false`.
- **AI assistant**: add `ANTHROPIC_API_KEY`, or the `ASSISTANT_*` variables (see `.env.example`), in Vercel to switch it from built-in guide mode to a real model. Customer data is sent to the chosen AI service.
- The free Supabase plan pauses a project after a week of inactivity, and Vercel's free plan limits function run time to 60 s.

## Accounts

`npm run accounts:provision -- --cloud` creates the Procurement department and Dealerships Head accounts in the local and cloud databases (see the README, "Procurement department and Dealerships Heads"). Role changes reach the cloud database automatically when the app boots, or with `npm run db:sync` against it.
