import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { jobHealth, logError, pruneOpsLogs, recordJob } from "@/server/platform/ops-log";

beforeEach(async () => {
  await platformDb().jobRun.deleteMany({});
  await platformDb().errorLog.deleteMany({});
});
afterAll(async () => {
  await platformDb().jobRun.deleteMany({});
  await platformDb().errorLog.deleteMany({});
});

describe("operations logs", () => {
  it("records a successful job with its summary", async () => {
    const out = await recordJob("lifecycle", async () => ({ checked: 3 }));
    expect(out).toEqual({ checked: 3 });
    const r = await platformDb().jobRun.findFirstOrThrow({ where: { job: "lifecycle" } });
    expect(r.ok).toBe(true);
    expect(r.finishedAt).not.toBeNull();
    expect(r.summary).toEqual({ checked: 3 });
  });

  it("records a failed job, logs the error and rethrows", async () => {
    await expect(recordJob("lifecycle", async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    const r = await platformDb().jobRun.findFirstOrThrow({ where: { job: "lifecycle" } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("db down");
    expect(await platformDb().errorLog.count({ where: { source: "job.lifecycle" } })).toBe(1);
  });

  it("treats a result with ok:false as a failed run", async () => {
    await recordJob("scheduled-jobs", async () => ({ ok: false, failed: ["acme"] }));
    expect((await platformDb().jobRun.findFirstOrThrow({ where: { job: "scheduled-jobs" } })).ok).toBe(false);
  });

  it("logError stores message, stack and context, and never throws", async () => {
    await logError("webhook.stripe", new Error("boom"), { detail: { eventId: "evt_1" } });
    const e = await platformDb().errorLog.findFirstOrThrow();
    expect(e).toMatchObject({ source: "webhook.stripe", message: "boom", detail: { eventId: "evt_1" } });
    expect(e.stack).toContain("boom");
    await expect(logError("x", { weird: true })).resolves.toBeUndefined();
  });

  it("flags jobs that never ran or are overdue", async () => {
    let h = await jobHealth();
    expect(h.every((j) => j.stale && j.lastRun === null)).toBe(true);
    await recordJob("scheduled-jobs", async () => ({}));
    h = await jobHealth();
    expect(h.find((j) => j.job === "scheduled-jobs")).toMatchObject({ stale: false, lastOk: true });
    await platformDb().jobRun.updateMany({ where: { job: "scheduled-jobs" }, data: { startedAt: new Date(Date.now() - 2 * 3_600_000) } });
    expect((await jobHealth()).find((j) => j.job === "scheduled-jobs")?.stale).toBe(true);
  });

  it("prunes old rows only", async () => {
    await platformDb().errorLog.createMany({ data: [{ source: "a", message: "old", at: new Date(Date.now() - 31 * 86_400_000) }, { source: "a", message: "new" }] });
    await platformDb().jobRun.createMany({ data: [{ job: "j", startedAt: new Date(Date.now() - 91 * 86_400_000) }, { job: "j" }] });
    await pruneOpsLogs();
    expect((await platformDb().errorLog.findMany()).map((e) => e.message)).toEqual(["new"]);
    expect(await platformDb().jobRun.count()).toBe(1);
  });
});
