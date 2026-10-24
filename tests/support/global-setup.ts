import { execSync } from "node:child_process";
import { loadTestEnv } from "./load-env";

/** Applies migrations (CRM schema and the platform control-plane schema) to the dedicated test database once per run. */
export default async function setup() {
  loadTestEnv();
  const env = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx prisma migrate deploy --schema prisma/platform/schema.prisma", { stdio: "inherit", env });
}
