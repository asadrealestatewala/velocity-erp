import "server-only";
import { PrismaClient as PlatformClient } from "@yadea/platform-client";

/** `postgresql://…?schema=public` → same server, different schema (plus optional extra params). */
export function withParams(url: string, params: Record<string, string>) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

const g = globalThis as unknown as { platformPrisma?: PlatformClient };

function platformUrl() {
  const explicit = process.env.PLATFORM_DATABASE_URL;
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");
  return withParams(base, { schema: "platform" });
}

/** The control-plane database: companies, plans, billing, platform staff, audit. Never holds CRM data. */
export function platformDb(): PlatformClient {
  if (!g.platformPrisma) {
    g.platformPrisma = new PlatformClient({ datasourceUrl: platformUrl(), log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
  }
  return g.platformPrisma;
}

export type { PlatformClient };
export { Prisma as PlatformPrisma } from "@yadea/platform-client";
