/** Writes a full export of one workspace to a ZIP file. For very large workspaces, or when the console download would time out.
 *  Usage: npm run tenants:export -- <workspace-code> <output.zip> */
import { loadEnvFile } from "node:process";
try { loadEnvFile(".env"); } catch { /* env may already be set */ }
import fs from "node:fs";
import { once } from "node:events";
import { platformDb } from "../src/server/platform/client";
import { writeWorkspaceExport } from "../src/server/platform/export";

async function main() {
  const [slug, out] = process.argv.slice(2);
  if (!slug || !out) throw new Error("Usage: npm run tenants:export -- <workspace-code> <output.zip>");
  const t = await platformDb().tenant.findUnique({ where: { slug } });
  if (!t) throw new Error(`No workspace "${slug}"`);
  const ws = fs.createWriteStream(out);
  const summary = await writeWorkspaceExport(t, async (chunk) => { if (!ws.write(chunk)) await once(ws, "drain"); });
  ws.end();
  await once(ws, "finish");
  console.log(`Wrote ${out}`, summary);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
