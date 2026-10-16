import fs from "node:fs";
import path from "node:path";

/** Loads .env.test (falls back to .env.example values for optional keys). Tests NEVER use the dev database. */
export function loadTestEnv() {
  const file = path.resolve(__dirname, "../../.env.test");
  if (!fs.existsSync(file)) throw new Error("Missing .env.test — copy .env.example and point DATABASE_URL at a dedicated test database.");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trim().startsWith("#")) process.env[m[1]!] = m[2]!;
  }
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to run: DATABASE_URL in .env.test must point to a *test* database.");
  process.env.TZ = process.env.APP_TIMEZONE || "Asia/Karachi";
  process.env.SMTP_HOST = "";
}
