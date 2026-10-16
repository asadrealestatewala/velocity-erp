import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Hash an IP (or other identifier) so raw addresses are never stored. */
export function hashIdentifier(value: string) {
  return createHmac("sha256", env.appSecret).update(value).digest("hex").slice(0, 32);
}

/**
 * Fixed-window rate limiter backed by Postgres so it works across instances.
 * Returns true when the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${windowStart})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" = ${windowStart} THEN "RateLimitBucket"."count" + 1 ELSE 1 END,
      "windowStart" = ${windowStart}
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}
