// Seeded demo accounts — LOCAL DEVELOPMENT ONLY. See prisma/seed.ts and README.
export const DEMO_EMAIL_DOMAIN = "yadea-demo.local";

/** Password given to every seeded demo account (override with SEED_PASSWORD before seeding). */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || "Yadea@Dev2026";
