import { execSync } from "node:child_process";
import { loadTestEnv } from "./load-env";

/** Applies migrations to the dedicated test database once per run. */
export default async function setup() {
  loadTestEnv();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
}
