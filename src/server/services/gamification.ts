import "server-only";
import type { Tx } from "@/lib/db";
import { notify } from "./notifications";

export const GAMIFICATION_EVENTS = {
  FIRST_CONTACT: "Contacted a newly assigned lead",
  FAST_RESPONSE_BONUS: "Responded within the response window",
  FOLLOW_UP_COMPLETED: "Completed a follow-up",
  STAGE_ADVANCED: "Advanced a lead to a new stage",
  TEST_DRIVE_COMPLETED: "Completed a scheduled test drive",
  LEAD_CONVERTED: "Converted a lead",
  TASK_ON_TIME: "Completed a task on time",
} as const;
export type GamificationEventType = keyof typeof GAMIFICATION_EVENTS;

/**
 * Award points for an auditable business event. `uniqueKey` guarantees each subject can only
 * earn a given award once (e.g. moving a lead back and forth never re-awards points).
 */
export async function award(
  tx: Tx,
  e: { userId: string; dealershipId?: string | null; type: GamificationEventType; uniqueKey: string; leadId?: string | null },
) {
  const row = await tx.setting.findUnique({ where: { key: "system" } });
  const g = (row?.value as { gamification?: { enabled?: boolean; points?: Record<string, number> } } | null)?.gamification;
  if (g?.enabled === false) return null;
  const defaults: Record<GamificationEventType, number> = {
    FIRST_CONTACT: 10, FAST_RESPONSE_BONUS: 10, FOLLOW_UP_COMPLETED: 5, STAGE_ADVANCED: 3,
    TEST_DRIVE_COMPLETED: 15, LEAD_CONVERTED: 50, TASK_ON_TIME: 5,
  };
  const points = g?.points?.[e.type] ?? defaults[e.type];
  if (!points) return null;

  const existing = await tx.gamificationEvent.findUnique({ where: { uniqueKey: e.uniqueKey } });
  if (existing) return null;
  const ev = await tx.gamificationEvent.create({
    data: { userId: e.userId, dealershipId: e.dealershipId ?? null, type: e.type, points, leadId: e.leadId ?? null, uniqueKey: e.uniqueKey },
  });
  await evaluateAchievements(tx, e.userId);
  return ev;
}

type Criteria = { eventType?: string; count?: number; totalPoints?: number };

export async function evaluateAchievements(tx: Tx, userId: string) {
  const [achievements, earned] = await Promise.all([
    tx.achievement.findMany({ where: { isActive: true } }),
    tx.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
  ]);
  const have = new Set(earned.map((e) => e.achievementId));
  for (const a of achievements) {
    if (have.has(a.id)) continue;
    const c = a.criteria as Criteria;
    let met = false;
    if (c.eventType && c.count) {
      const n = await tx.gamificationEvent.count({ where: { userId, type: c.eventType } });
      met = n >= c.count;
    } else if (c.totalPoints) {
      const s = await tx.gamificationEvent.aggregate({ where: { userId }, _sum: { points: true } });
      met = (s._sum.points ?? 0) >= c.totalPoints;
    }
    if (met) {
      await tx.userAchievement.create({ data: { userId, achievementId: a.id } });
      await notify(tx, {
        userIds: [userId],
        type: "MILESTONE",
        title: `Badge earned: ${a.name}`,
        body: a.description,
        link: { portal: "/portal/leaderboard?celebrate=1", central: "/crm/dashboard" },
        entityType: "Achievement",
        entityId: a.id,
      });
    }
  }
}
