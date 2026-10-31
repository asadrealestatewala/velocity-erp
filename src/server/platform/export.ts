import "server-only";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import type { Tenant } from "@yadea/platform-client";
import { db } from "@/lib/db";
import { storage } from "@/server/storage";
import { SCHEMA_RE, withClient } from "./migrate";
import { runInTenant } from "./runtime";
import { tenantDbUrl } from "./tenants";

/** Columns that never leave the system, whatever the table: password hashes, 2FA secrets and recovery codes, and token hashes. */
export const SECRET_COLUMN = /(password|secret|recoverycodes|totp|tokenhash)/i;
/** Whole tables that are credentials or housekeeping, not customer data. */
export const SKIPPED_TABLES = new Set(["Session", "PasswordResetToken", "_tenant_migrations"]);

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export function redact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SECRET_COLUMN.test(k)) out[k] = v;
  return out;
}

export type ExportSummary = { tables: Record<string, number>; files: number; filesSkipped: number };

/** Total size of stored files added to one export; anything beyond is listed in the manifest instead of being embedded. */
const FILE_BUDGET_BYTES = 1024 * 1024 * 1024;

/**
 * Writes a ZIP of everything a workspace owns to `onChunk`: one JSON-lines file per table (secrets removed), the uploaded
 * files, and a manifest. Rows are read through a cursor so memory stays flat per table.
 */
export async function writeWorkspaceExport(t: Tenant, onChunk: (chunk: Uint8Array) => void | Promise<void>): Promise<ExportSummary> {
  if (!SCHEMA_RE.test(t.dbSchema)) throw new Error("Invalid schema name");
  const pending: Promise<void>[] = [];
  let zipError: unknown = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else pending.push(Promise.resolve(onChunk(chunk)));
  });
  const flush = async () => {
    await Promise.all(pending.splice(0));
    if (zipError) throw zipError;
  };
  const summary: ExportSummary = { tables: {}, files: 0, filesSkipped: 0 };

  await withClient(t.dbUrlEnc ? tenantDbUrl(t) : undefined, async (c) => {
    try {
      await c.query("BEGIN READ ONLY");
      const tables = (await c.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name", [t.dbSchema])).rows.map((r) => r.table_name).filter((n) => !SKIPPED_TABLES.has(n));
      let fileRows: { storageKey: string; originalName: string; size: number }[] = [];
      for (const table of tables) {
        const file = new ZipDeflate(`data/${table}.jsonl`, { level: 6 });
        zip.add(file);
        let n = 0;
        await c.query(`DECLARE exp_cur NO SCROLL CURSOR FOR SELECT row_to_json(x) AS r FROM ${q(t.dbSchema)}.${q(table)} x`);
        for (;;) {
          const { rows } = await c.query<{ r: Record<string, unknown> }>("FETCH 1000 FROM exp_cur");
          if (!rows.length) break;
          const chunk = rows.map((row) => JSON.stringify(redact(row.r))).join("\n") + "\n";
          file.push(strToU8(chunk), false);
          n += rows.length;
          await flush();
        }
        file.push(new Uint8Array(0), true);
        await c.query("CLOSE exp_cur");
        summary.tables[table] = n;
        if (table === "StoredFile") {
          fileRows = (await c.query(`SELECT "storageKey", "originalName", "size" FROM ${q(t.dbSchema)}."StoredFile"`)).rows;
        }
        await flush();
      }
      await c.query("COMMIT");

      const skipped: string[] = [];
      let used = 0;
      await runInTenant(t.slug, async () => {
        for (const f of fileRows) {
          if (used + f.size > FILE_BUDGET_BYTES) { skipped.push(f.storageKey); continue; }
          try {
            const data = await storage().get(f.storageKey);
            used += data.length;
            const entry = new ZipPassThrough(`files/${f.storageKey}`);
            zip.add(entry);
            entry.push(new Uint8Array(data), true);
            summary.files++;
            await flush();
          } catch {
            skipped.push(f.storageKey);
          }
        }
      });
      summary.filesSkipped = skipped.length;
      const manifest = {
        workspace: { slug: t.slug, name: t.name, ownerEmail: t.ownerEmail },
        exportedAt: new Date().toISOString(),
        format: "One JSON object per line in data/<Table>.jsonl; uploaded files under files/ at their storage key.",
        redacted: "Password hashes, two-factor secrets and recovery codes, token hashes, and sign-in sessions are never exported.",
        tables: summary.tables,
        files: summary.files,
        filesNotIncluded: skipped,
      };
      const m = new ZipDeflate("manifest.json");
      zip.add(m);
      m.push(strToU8(JSON.stringify(manifest, null, 2)), true);
      zip.end();
      await flush();
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
  return summary;
}

/** The export as a web stream (for a download response). */
export function workspaceExportStream(t: Tenant): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await writeWorkspaceExport(t, (chunk) => controller.enqueue(chunk));
        controller.close();
      } catch (e) {
        console.error("[export] failed", e);
        controller.error(e);
      }
    },
  });
}

/** Deletes every uploaded file of a workspace from storage (best effort, returns how many were removed). */
export async function deleteWorkspaceFiles(t: Tenant): Promise<number> {
  return runInTenant(t.slug, async () => {
    const keys = await db.storedFile.findMany({ select: { storageKey: true } });
    let n = 0;
    for (const k of keys) {
      try { await storage().delete(k.storageKey); n++; } catch { /* already gone */ }
    }
    return n;
  });
}
