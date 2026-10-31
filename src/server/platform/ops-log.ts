import "server-only";
import { platformDb } from "./client";

const DAY = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Records a failure for the System → Logs page. Never throws and never blocks the caller: logging must not make an incident worse. */
export async function logError(source: string, err: unknown, ctx: { path?: string; detail?: object } = {}): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await platformDb().errorLog.create({ data: { source: clip(source, 60), message: clip(e.message, 2000), stack: e.stack ? clip(e.stack, 6000) : null, path: ctx.path ? clip(ctx.path, 300) : null, detail: (ctx.detail ?? {}) as object } });
  } catch (inner) {
    console.error("[ops-log] could not record error", (inner as Error).message);
  }
}

/** Runs `fn` and records the run (start, end, outcome, summary). A result with `ok: false` counts as a failed run; thrown errors are recorded and rethrown. */
export async function recordJob<T extends object | null | void>(job: string, fn: () => Promise<T>): Promise<T> {
  let id: string | null = null;
  try {
    id = (await platformDb().jobRun.create({ data: { job } })).id;
  } catch { /* logging must never stop the job */ }
  try {
    const out = await fn();
    if (id) await platformDb().jobRun.update({ where: { id }, data: { ok: (out as { ok?: boolean } | null)?.ok !== false, finishedAt: new Date(), summary: (out ?? {}) as object } }).catch(() => {});
    return out;
  } catch (e) {
    if (id) await platformDb().jobRun.update({ where: { id }, data: { ok: false, finishedAt: new Date(), error: clip(e instanceof Error ? e.message : String(e), 1000) } }).catch(() => {});
    await logError(`job.${job}`, e);
    throw e;
  }
}

/** Keeps the tables small: job history 90 days, errors 30 days. */
export async function pruneOpsLogs(now = new Date()) {
  await platformDb().jobRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - 90 * DAY) } } });
  await platformDb().errorLog.deleteMany({ where: { at: { lt: new Date(now.getTime() - 30 * DAY) } } });
}

export type JobHealth = { job: string; lastRun: Date | null; lastOk: boolean | null; lastError: string | null; stale: boolean };

/** Expected cadence in minutes per job; a job that hasn't run within 3× that is flagged as stale. */
export const JOB_CADENCE: Record<string, number> = { "scheduled-jobs": 15, lifecycle: 15 };

export async function jobHealth(now = new Date()): Promise<JobHealth[]> {
  const out: JobHealth[] = [];
  for (const [job, cadence] of Object.entries(JOB_CADENCE)) {
    const last = await platformDb().jobRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" } });
    out.push({ job, lastRun: last?.startedAt ?? null, lastOk: last ? last.ok : null, lastError: last?.error ?? null, stale: !last || now.getTime() - last.startedAt.getTime() > cadence * 3 * 60_000 });
  }
  return out;
}
