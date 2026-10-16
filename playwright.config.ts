import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// E2E runs against the dedicated TEST database on port 3100 — never the development data.
const testEnv: Record<string, string> = {};
for (const line of fs.readFileSync(".env.test", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !line.trim().startsWith("#")) testEnv[m[1]!] = m[2]!;
}
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Karachi",
    actionTimeout: 20_000,
    navigationTimeout: 90_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: true,
    env: { ...testEnv, NEXT_DIST_DIR: ".next-e2e", APP_URL: `http://localhost:${PORT}` },
  },
});
