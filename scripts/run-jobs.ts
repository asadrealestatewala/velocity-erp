// CLI job runner: `npm run jobs:run` — use from cron / Windows Task Scheduler when an HTTP trigger isn't convenient.
import { runScheduledJobs } from "../src/server/services/jobs";
import { db } from "../src/lib/db";

process.env.TZ = process.env.APP_TIMEZONE || "Asia/Karachi";

runScheduledJobs()
  .then((r) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...r }));
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
