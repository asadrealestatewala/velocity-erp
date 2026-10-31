import "server-only";

export type PlatformDemoLogin = { email: string; password: string } | null;

/**
 * Demo sign-in for the Platform console. Off unless SHOW_PLATFORM_DEMO_CREDENTIALS="true", so a production
 * deployment never shows it by default. The account is a throwaway one you create yourself (give it the read-only
 * ANALYTICS role) and put in PLATFORM_DEMO_EMAIL / PLATFORM_DEMO_PASSWORD — nothing is hard-coded here. It is refused
 * if it is the owner account (PLATFORM_ADMIN_EMAIL) or if the password is the owner bootstrap password.
 */
export function platformDemoLogin(env: Record<string, string | undefined> = process.env): PlatformDemoLogin {
  if (env.SHOW_PLATFORM_DEMO_CREDENTIALS !== "true") return null;
  const email = env.PLATFORM_DEMO_EMAIL?.trim().toLowerCase();
  const password = env.PLATFORM_DEMO_PASSWORD;
  if (!email || !password) return null;
  if (email === env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() || password === env.PLATFORM_ADMIN_PASSWORD) return null;
  return { email, password };
}
