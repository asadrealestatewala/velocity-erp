import "server-only";
import bcrypt from "bcryptjs";
import { platformDb } from "./client";

/** Creates the very first OWNER from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD, only when no admin exists yet. */
export async function ensureFirstAdmin(): Promise<boolean> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) return false;
  const db = platformDb();
  if ((await db.platformAdmin.count()) > 0) return false;
  await db.platformAdmin.create({ data: { email, name: "Platform owner", passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
  return true;
}
