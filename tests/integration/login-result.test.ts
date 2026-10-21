import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { db } from "@/lib/db";
import { loginAction, loginWithResultAction } from "@/server/actions/auth";
import { getUserProgress } from "@/server/services/progress";
import { buildWorld, type World } from "../support/fixtures";

let w: World;
const form = (identifier: string, password: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("identifier", identifier);
  fd.set("password", password);
  fd.set("portal", "portal");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(async () => {
  w = await buildWorld();
  const bcrypt = await import("bcryptjs");
  await db.user.update({ where: { id: w.aManager.id }, data: { passwordHash: bcrypt.hashSync("Correct-Horse-1", 4) } });
});

describe("animated sign-in result (the success scene is driven by this)", () => {
  it("reports ok with the destination only when the credentials are genuinely valid", async () => {
    const r = await loginWithResultAction(undefined, form("A.Manager@test.local", "Correct-Horse-1"));
    expect(r).toEqual({ ok: true, redirectTo: "/portal/dashboard" });
    expect((await db.user.findUniqueOrThrow({ where: { id: w.aManager.id } })).lastLoginAt).not.toBeNull();
  });

  it("never reports ok for a wrong password, and gives the same answer as an unknown account", async () => {
    const wrong = await loginWithResultAction(undefined, form("A.Manager@test.local", "nope-nope-nope"));
    const unknown = await loginWithResultAction(undefined, form("nobody@test.local", "nope-nope-nope"));
    expect(wrong.ok).toBe(false);
    expect(wrong).toEqual(unknown);
    expect(await db.session.count({ where: { userId: w.aManager.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: w.aManager.id } })).lastLoginAt).toBeNull();
  });

  it("refuses a deactivated account", async () => {
    await db.user.update({ where: { id: w.aManager.id }, data: { isActive: false } });
    expect((await loginWithResultAction(undefined, form("A.Manager@test.local", "Correct-Horse-1"))).ok).toBe(false);
  });

  it("never sends the user outside their own area via ?next=", async () => {
    const r = await loginWithResultAction(undefined, form("A.Manager@test.local", "Correct-Horse-1", { next: "//evil.example/crm" }));
    expect(r).toEqual({ ok: true, redirectTo: "/portal/dashboard" });
    const other = await loginWithResultAction(undefined, form("A.Manager@test.local", "Correct-Horse-1", { next: "/crm/settings" }));
    expect(other).toEqual({ ok: true, redirectTo: "/portal/dashboard" });
  });

  it("keeps the classic action redirecting (no-JavaScript fallback)", async () => {
    await expect(loginAction(undefined, form("A.Manager@test.local", "Correct-Horse-1"))).rejects.toMatchObject({ digest: expect.stringContaining("/portal/dashboard") });
    expect(await loginAction(undefined, form("A.Manager@test.local", "wrong"))).toMatchObject({ error: expect.stringMatching(/invalid/i) });
  });
});

describe("progress panel data comes only from recorded events", () => {
  it("is all zeros for a user with no recorded activity", async () => {
    const p = await getUserProgress(w.aManager.id);
    expect(p).toMatchObject({ monthPoints: 0, totalPoints: 0, streakDays: 0, badgesEarned: 0, weekDelta: null, rank: null });
  });

  it("counts points, a consecutive-day streak and the week-over-week change from real rows", async () => {
    const now = new Date();
    const day = (n: number) => new Date(now.getTime() - n * 86400_000);
    await db.gamificationEvent.createMany({
      data: [
        { userId: w.aManager.id, type: "FOLLOW_UP_COMPLETED", points: 5, uniqueKey: "t-1", createdAt: day(0) },
        { userId: w.aManager.id, type: "FOLLOW_UP_COMPLETED", points: 5, uniqueKey: "t-2", createdAt: day(1) },
        { userId: w.aManager.id, type: "TEST_DRIVE_COMPLETED", points: 15, uniqueKey: "t-3", createdAt: day(2) },
        { userId: w.aManager.id, type: "LEAD_CONVERTED", points: 50, uniqueKey: "t-4", createdAt: day(9) },
        { userId: w.aManager.id, type: "TASK_ON_TIME", points: 5, uniqueKey: "t-5", createdAt: day(5) }, // gap day 3-4 is irrelevant to the streak
      ],
    });
    const p = await getUserProgress(w.aManager.id, now);
    expect(p.totalPoints).toBe(80);
    expect(p.weekPoints).toBe(30); // days 0,1,2,5
    expect(p.prevWeekPoints).toBe(50);
    expect(p.weekDelta).toBe(-40);
    expect(p.streakDays).toBe(3);
    expect(p.rank?.of).toBeGreaterThanOrEqual(1);
  });
});
