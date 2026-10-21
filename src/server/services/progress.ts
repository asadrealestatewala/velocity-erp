import "server-only";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { db } from "@/lib/db";

type Criteria = { eventType?: string; count?: number; totalPoints?: number };

export type UserProgress = {
  monthPoints: number;
  totalPoints: number;
  /** Points in the last 7 days vs the 7 days before (null when there is nothing to compare). */
  weekPoints: number;
  prevWeekPoints: number;
  weekDelta: number | null;
  /** Consecutive days (ending today, or yesterday if nothing yet today) with at least one awarded business event. */
  streakDays: number;
  badgesEarned: number;
  badgesTotal: number;
  /** The closest unearned badge, with real progress toward its criteria. */
  next: { name: string; description: string; current: number; target: number; pct: number } | null;
  /** Rank among everyone with points this month (null when the user has none). */
  rank: { position: number; of: number } | null;
};

/**
 * Everything on the "your progress" panel is derived from recorded GamificationEvent / UserAchievement rows —
 * nothing is estimated or invented. A user with no events simply gets zeros.
 */
export async function getUserProgress(userId: string, now = new Date()): Promise<UserProgress> {
  const monthStart = startOfMonth(now);
  const weekStart = subDays(now, 7);
  const prevWeekStart = subDays(now, 14);
  const [month, total, week, prevWeek, events, achievements, earned, board] = await Promise.all([
    db.gamificationEvent.aggregate({ where: { userId, createdAt: { gte: monthStart } }, _sum: { points: true } }),
    db.gamificationEvent.aggregate({ where: { userId }, _sum: { points: true } }),
    db.gamificationEvent.aggregate({ where: { userId, createdAt: { gte: weekStart } }, _sum: { points: true } }),
    db.gamificationEvent.aggregate({ where: { userId, createdAt: { gte: prevWeekStart, lt: weekStart } }, _sum: { points: true } }),
    db.gamificationEvent.findMany({ where: { userId, createdAt: { gte: subDays(now, 90) } }, select: { createdAt: true } }),
    db.achievement.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    db.gamificationEvent.groupBy({ by: ["userId"], where: { createdAt: { gte: monthStart } }, _sum: { points: true } }),
  ]);

  const days = new Set(events.map((e) => startOfDay(e.createdAt).getTime()));
  let streak = 0;
  let cursor = startOfDay(now);
  if (!days.has(cursor.getTime())) cursor = subDays(cursor, 1); // today may simply not have happened yet
  while (days.has(cursor.getTime())) {
    streak++;
    cursor = subDays(cursor, 1);
  }

  const have = new Set(earned.map((e) => e.achievementId));
  const typeCounts = new Map<string, number>();
  const totalPts = total._sum.points ?? 0;
  let next: UserProgress["next"] = null;
  for (const a of achievements) {
    if (have.has(a.id)) continue;
    const c = a.criteria as Criteria;
    let current = 0;
    let target = 0;
    if (c.eventType && c.count) {
      if (!typeCounts.has(c.eventType)) typeCounts.set(c.eventType, await db.gamificationEvent.count({ where: { userId, type: c.eventType } }));
      current = typeCounts.get(c.eventType)!;
      target = c.count;
    } else if (c.totalPoints) {
      current = totalPts;
      target = c.totalPoints;
    } else continue;
    const pct = Math.min(99, Math.round((current / target) * 100));
    if (!next || pct > next.pct) next = { name: a.name, description: a.description, current, target, pct };
  }

  const monthPoints = month._sum.points ?? 0;
  const ranked = board.filter((b) => (b._sum.points ?? 0) > 0).sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0));
  const idx = ranked.findIndex((b) => b.userId === userId);
  const weekPoints = week._sum.points ?? 0;
  const prevWeekPoints = prevWeek._sum.points ?? 0;
  return {
    monthPoints,
    totalPoints: totalPts,
    weekPoints,
    prevWeekPoints,
    weekDelta: prevWeekPoints > 0 ? Math.round(((weekPoints - prevWeekPoints) / prevWeekPoints) * 100) : null,
    streakDays: streak,
    badgesEarned: earned.length,
    badgesTotal: achievements.length,
    next,
    rank: idx >= 0 ? { position: idx + 1, of: ranked.length } : null,
  };
}
