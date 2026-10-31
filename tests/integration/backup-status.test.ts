import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { backupStatus, finishBackupRun, recordManualBackup, startBackupRun } from "@/server/platform/backups";

const clear = () => platformDb().backupRun.deleteMany({});
beforeEach(clear);
afterAll(clear);

describe("backup status", () => {
  it("flags the platform as unprotected when nothing was ever recorded", async () => {
    const s = await backupStatus();
    expect(s).toMatchObject({ lastOk: null, ageHours: null, stale: true });
  });

  it("a verified script run is fresh; a failed one is not counted", async () => {
    const bad = await startBackupRun("backups/a");
    await finishBackupRun(bad.id, [{ schema: "platform", label: "platform", ok: true, verified: true }, { schema: "t_x", label: "x", ok: false, error: "pg_dump failed" }]);
    expect((await backupStatus()).stale).toBe(true);
    const good = await startBackupRun("backups/b");
    await finishBackupRun(good.id, [{ schema: "platform", label: "platform", ok: true, verified: true }]);
    const s = await backupStatus();
    expect(s.stale).toBe(false);
    expect(s.lastOk?.id).toBe(good.id);
  });

  it("an unreadable dump makes the run a problem", async () => {
    const r = await startBackupRun("backups/c");
    const done = await finishBackupRun(r.id, [{ schema: "platform", label: "platform", ok: true, verified: false }]);
    expect(done.ok).toBe(false);
  });

  it("goes stale after 36 hours and accepts a manually recorded backup", async () => {
    await recordManualBackup("Supabase snapshot", "op@test", new Date(Date.now() - 40 * 3_600_000));
    expect((await backupStatus()).stale).toBe(true);
    await recordManualBackup("Supabase snapshot", "op@test");
    const s = await backupStatus();
    expect(s.stale).toBe(false);
    expect(s.lastOk?.kind).toBe("MANUAL");
  });

  it("lists workspaces missing from the last script backup", async () => {
    const t = await platformDb().tenant.create({ data: { slug: "t-bk-missing", name: "Missing", dbSchema: "t_bk_missing", status: "ACTIVE" } });
    try {
      const r = await startBackupRun("backups/d");
      await finishBackupRun(r.id, [{ schema: "platform", label: "platform", ok: true, verified: true }]);
      expect((await backupStatus()).uncovered).toContain("t-bk-missing");
    } finally {
      await platformDb().tenant.delete({ where: { id: t.id } });
    }
  });
});
