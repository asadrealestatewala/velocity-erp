import { execSync } from "node:child_process";
import fs from "node:fs";

/** Fresh test database: apply migrations, wipe all rows, load the standard demo seed. */
export default async function globalSetup() {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of fs.readFileSync(".env.test", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]!] = m[2]!;
  }
  if (!/test/i.test(env.DATABASE_URL ?? "")) throw new Error("E2E must run against a test database");
  env.PRISMA_HIDE_UPDATE_MESSAGE = "1";
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx tests/e2e/truncate.ts", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { stdio: "inherit", env });
}
