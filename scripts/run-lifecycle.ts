/** Runs the subscription lifecycle once (trial/renewal state changes + reminders). Safe to repeat. `npm run platform:lifecycle` */
import { loadEnvFile } from "node:process";
try { loadEnvFile(".env"); } catch { /* env may already be set */ }
import { runLifecycle } from "../src/server/platform/lifecycle";

runLifecycle().then((r) => { console.log(r); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
