import type { PrismaClient } from "@prisma/client";
import { tenantClient } from "@/server/platform/runtime";

/**
 * The CRM database handle.
 *
 * Every company (workspace) has its own PostgreSQL schema. `db` looks like one Prisma client, but each call is
 * routed to the client of the workspace the current request belongs to (see server/platform/runtime.ts), so the
 * ~130 modules that `import { db }` stay unchanged and cannot reach another workspace's tables.
 */
type AnyFn = (...args: unknown[]) => Promise<unknown>;

function delegate(model: string) {
  return new Proxy(
    {},
    {
      get: (_t, method) => (typeof method === "string" ? ((...args: unknown[]) => tenantClient().then((c) => ((c as unknown as Record<string, Record<string, AnyFn>>)[model]![method]!)(...args))) : undefined),
    },
  );
}

export const db = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    if (typeof prop !== "string" || prop === "then") return undefined; // not thenable, no symbol probing
    if (prop === "$transaction") {
      return (first: unknown, ...rest: unknown[]) => {
        if (Array.isArray(first)) throw new Error("db.$transaction([...]) is not supported with per-workspace clients; use the interactive form db.$transaction(async (tx) => …).");
        return tenantClient().then((c) => (c.$transaction as unknown as AnyFn)(first, ...rest));
      };
    }
    if (prop.startsWith("$")) return (...args: unknown[]) => tenantClient().then((c) => ((c as unknown as Record<string, AnyFn>)[prop]!)(...args));
    return delegate(prop);
  },
});

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
