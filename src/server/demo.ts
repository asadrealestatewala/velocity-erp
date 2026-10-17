import "server-only";
import { db } from "@/lib/db";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "@/lib/demo";

export type DemoAccount = { email: string; name: string; role: string; scope: "CENTRAL" | "DEALERSHIP"; dealership: string | null };
export type DemoInfo = { password: string; accounts: DemoAccount[] } | null;

/**
 * Demo credentials shown on the sign-in pages.
 * Never in production (hard-blocked), and can be switched off locally with SHOW_DEMO_CREDENTIALS=false.
 * Only lists active seeded accounts that actually exist in the database.
 */
export async function getDemoAccounts(): Promise<DemoInfo> {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.SHOW_DEMO_CREDENTIALS === "false") return null;
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, isActive: true },
    select: {
      email: true, name: true,
      role: { select: { name: true, scope: true, createdAt: true } },
      memberships: { where: { isActive: true }, select: { dealership: { select: { name: true } } } },
    },
    orderBy: [{ role: { scope: "asc" } }, { role: { createdAt: "asc" } }, { email: "asc" }],
  });
  if (!users.length) return null;
  return {
    password: DEMO_PASSWORD,
    accounts: users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role.name,
      scope: u.role.scope,
      dealership: u.memberships.map((m) => m.dealership.name).join(", ") || null,
    })),
  };
}
