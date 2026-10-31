import "server-only";
import type { Prisma } from "@yadea/platform-client";

export const SUB_STATUSES = ["PENDING", "TRIALING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELED", "SUSPENDED"] as const;

/** One definition of "which workspaces match these filters", shared by the list page and the CSV export. */
export function tenantWhere(q?: string | null, sub?: string | null): Prisma.TenantWhereInput {
  return {
    ...(sub && (SUB_STATUSES as readonly string[]).includes(sub) ? { subStatus: sub as (typeof SUB_STATUSES)[number] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { ownerEmail: { contains: q, mode: "insensitive" } }] } : {}),
  };
}
