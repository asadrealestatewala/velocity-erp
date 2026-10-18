import "server-only";
import { db } from "@/lib/db";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from "@/lib/demo";

export type DemoGroup = "PROCUREMENT" | "CENTRAL" | "DEALERSHIP";
export type DemoAccount = { email: string; phone: string | null; name: string; role: string; group: DemoGroup; dealership: string | null };
export type DemoInfo = { password: string; accounts: DemoAccount[] } | null;

const isLocalHost = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

/**
 * Whether the demo-credentials panel may be shown. It is allowed only when the app is served from a
 * local address (APP_URL), so a real deployment at a public domain never exposes it — regardless of
 * NODE_ENV (the local `npm run preview` runs in production mode for speed). Turn it off anywhere
 * with SHOW_DEMO_CREDENTIALS=false.
 */
export function demoCredentialsAllowed({ appUrl, flag }: { appUrl?: string; flag?: string }) {
  if (flag === "false") return false;
  try {
    return isLocalHost(new URL(appUrl || "http://localhost:3000").hostname);
  } catch {
    return false;
  }
}

/** Demo credentials shown on the sign-in pages. Only lists active seeded accounts that exist in the database. */
export async function getDemoAccounts(): Promise<DemoInfo> {
  if (!demoCredentialsAllowed({ appUrl: process.env.APP_URL, flag: process.env.SHOW_DEMO_CREDENTIALS })) return null;
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, isActive: true },
    select: {
      email: true, phone: true, name: true,
      role: { select: { key: true, name: true, scope: true, createdAt: true } },
      memberships: { where: { isActive: true }, select: { dealership: { select: { name: true } } } },
    },
    orderBy: [{ role: { scope: "asc" } }, { role: { createdAt: "asc" } }, { email: "asc" }],
  });
  if (!users.length) return null;
  return {
    password: DEMO_PASSWORD,
    accounts: users.map((u) => ({
      email: u.email,
      phone: u.phone,
      name: u.name,
      role: u.role.name,
      group: (u.role.key === "PROCUREMENT" ? "PROCUREMENT" : u.role.scope === "DEALERSHIP" ? "DEALERSHIP" : "CENTRAL") as DemoGroup,
      dealership: u.memberships.map((m) => m.dealership.name).join(", ") || null,
    })),
  };
}
