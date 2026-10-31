import "server-only";
import { platformDb } from "./client";

export type BackupItem = { schema: string; label: string; ok: boolean; bytes?: number; verified?: boolean; error?: string };

/** A backup older than this (or none at all) is flagged on the System page. */
export const BACKUP_STALE_HOURS = 36;

export async function startBackupRun(location: string) {
  return platformDb().backupRun.create({ data: { kind: "SCRIPT", location } });
}

export async function finishBackupRun(id: string, items: BackupItem[]) {
  return platformDb().backupRun.update({ where: { id }, data: { finishedAt: new Date(), items, ok: items.length > 0 && items.every((i) => i.ok && i.verified !== false) } });
}

/** An operator records a backup taken outside the script (provider point-in-time snapshot, off-site copy). */
export async function recordManualBackup(note: string, by: string, at = new Date()) {
  return platformDb().backupRun.create({ data: { kind: "MANUAL", startedAt: at, finishedAt: at, ok: true, note: note.slice(0, 300), recordedBy: by } });
}

export type BackupStatus = {
  lastOk: { id: string; kind: string; finishedAt: Date; location: string | null } | null;
  ageHours: number | null;
  stale: boolean;
  /** Workspaces that are not in the most recent successful script backup (created since, or failed there). */
  uncovered: string[];
  recent: Awaited<ReturnType<typeof listRecent>>;
};

const listRecent = () => platformDb().backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 });

export async function backupStatus(now = new Date()): Promise<BackupStatus> {
  const [recent, lastOk, lastScriptOk, tenants] = await Promise.all([
    listRecent(),
    platformDb().backupRun.findFirst({ where: { ok: true, finishedAt: { not: null } }, orderBy: { finishedAt: "desc" } }),
    platformDb().backupRun.findFirst({ where: { ok: true, kind: "SCRIPT", finishedAt: { not: null } }, orderBy: { finishedAt: "desc" } }),
    platformDb().tenant.findMany({ where: { status: { not: "PROVISIONING" } }, select: { slug: true, dbSchema: true } }),
  ]);
  const covered = new Set(((lastScriptOk?.items ?? []) as BackupItem[]).filter((i) => i.ok).map((i) => i.schema));
  const uncovered = lastScriptOk ? tenants.filter((t) => !covered.has(t.dbSchema)).map((t) => t.slug) : [];
  const ageHours = lastOk?.finishedAt ? (now.getTime() - lastOk.finishedAt.getTime()) / 3_600_000 : null;
  return {
    lastOk: lastOk?.finishedAt ? { id: lastOk.id, kind: lastOk.kind, finishedAt: lastOk.finishedAt, location: lastOk.location } : null,
    ageHours,
    stale: ageHours === null || ageHours > BACKUP_STALE_HOURS,
    uncovered,
    recent,
  };
}
