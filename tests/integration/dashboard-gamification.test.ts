import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDailyMissions, getWeekActivity, levelFor, nextStreakMilestone } from "@/server/services/progress";
import { getFunnel } from "@/server/services/funnel";
import { buildWorld, type World } from "../support/fixtures";

let w: World;
beforeEach(async () => {
  w = await buildWorld();
});

describe("level rule", () => {
  it("starts level n at 60·(n−1)² XP and reports progress to the next", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 60, toNext: 60, pct: 0 });
    expect(levelFor(59).level).toBe(1);
    expect(levelFor(60)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 180 });
    expect(levelFor(240).level).toBe(3);
    expect(levelFor(150)).toMatchObject({ level: 2, xpIntoLevel: 90, toNext: 90, pct: 50 });
  });
  it("picks the next streak milestone", () => {
    expect(nextStreakMilestone(0)).toBe(3);
    expect(nextStreakMilestone(3)).toBe(7);
    expect(nextStreakMilestone(100)).toBeNull();
  });
});

describe("daily missions come only from today's recorded, de-duplicated events", () => {
  it("is empty progress when nothing was recorded", async () => {
    const d = await getDailyMissions(w.aManager.id);
    expect(d.xpToday).toBe(0);
    expect(d.missions.every((m) => m.done === 0 && !m.complete)).toBe(true);
  });

  it("counts today's events per mission, caps at the target and ignores other days and other users", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 26 * 3600_000);
    const mk = (type: string, key: string, points: number, who = w.aManager.id, at = now) => ({ userId: who, type, points, uniqueKey: key, createdAt: at });
    await db.gamificationEvent.createMany({
      data: [
        mk("FIRST_CONTACT", "m-1", 10), mk("FIRST_CONTACT", "m-2", 10),
        mk("FOLLOW_UP_COMPLETED", "m-3", 5), mk("TASK_ON_TIME", "m-4", 5), mk("FOLLOW_UP_COMPLETED", "m-5", 5),
        mk("TEST_DRIVE_COMPLETED", "m-6", 15), mk("TEST_DRIVE_COMPLETED", "m-7", 15),
        mk("FIRST_CONTACT", "m-8", 10, w.aManager.id, yesterday),
        mk("FIRST_CONTACT", "m-9", 10, w.aRep.id),
      ],
    });
    const d = await getDailyMissions(w.aManager.id, now);
    const by = Object.fromEntries(d.missions.map((m) => [m.key, m]));
    expect(by.contact).toMatchObject({ done: 2, target: 5, complete: false, xp: 20 });
    expect(by.followups).toMatchObject({ done: 3, target: 3, complete: true, xp: 15 });
    expect(by.testdrive).toMatchObject({ done: 1, target: 1, complete: true, xp: 30 }); // done is capped, XP is what was recorded
    expect(by.advance).toMatchObject({ done: 0, complete: false });
    expect(d.xpToday).toBe(65);
  });

  it("marks only days with recorded events as active in the week strip", async () => {
    const now = new Date();
    await db.gamificationEvent.create({ data: { userId: w.aManager.id, type: "FOLLOW_UP_COMPLETED", points: 5, uniqueKey: "wk-1", createdAt: now } });
    const week = await getWeekActivity(w.aManager.id, now);
    expect(week).toHaveLength(7);
    expect(week.filter((d) => d.active)).toHaveLength(1);
    expect(week[6]!.active).toBe(true);
  });
});

describe("pipeline funnel is built from the real stage definitions", () => {
  it("counts leads reached per stage in pipeline order and keeps lost leads out of the funnel", async () => {
    const stages = await db.leadStage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    const flow = stages.filter((s) => s.kind !== "LOST");
    const lostStage = stages.find((s) => s.kind === "LOST");
    const base = await getFunnel({});
    expect(base.stages.map((s) => s.id)).toEqual(flow.map((s) => s.id));
    // Reached is cumulative: it never increases from one stage to the next.
    for (let i = 1; i < base.stages.length; i++) expect(base.stages[i]!.reached).toBeLessThanOrEqual(base.stages[i - 1]!.reached);
    expect(base.stages[0]!.reached).toBe(base.total);
    if (lostStage) {
      const leadsLost = await db.lead.count({ where: { stageId: lostStage.id, isArchived: false } });
      expect(base.lost).toBe(leadsLost);
    }
  });

  it("respects the lead filter it is given", async () => {
    const none = await getFunnel({ id: "does-not-exist" });
    expect(none.total).toBe(0);
    expect(none.stages.every((s) => s.reached === 0 && s.ofTotalPct === 0)).toBe(true);
  });
});
