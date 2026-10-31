import "server-only";
import type { Tenant } from "@yadea/platform-client";
import { platformDb } from "./client";

export type AnnouncementView = { id: string; title: string; body: string; tone: "info" | "warn" | "danger" };
type Row = { id: string; title: string; body: string; tone: string; planKey: string | null; tenantId: string | null };

const TONE_RANK = { danger: 0, warn: 1, info: 2 } as const;
const MAX_SHOWN = 3;

/** Which announcements apply to this workspace right now (pure; the list is whatever is active in the window). */
export function selectAnnouncements(rows: Row[], t: Pick<Tenant, "id" | "planKey">): AnnouncementView[] {
  return rows
    .filter((r) => (!r.planKey || r.planKey === t.planKey) && (!r.tenantId || r.tenantId === t.id))
    .map((r) => ({ id: r.id, title: r.title, body: r.body, tone: (r.tone in TONE_RANK ? r.tone : "info") as AnnouncementView["tone"] }))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])
    .slice(0, MAX_SHOWN);
}

let cache: { at: number; rows: Row[] } | null = null;
export const clearAnnouncementCache = () => { cache = null; };

/** Cached for 30 s: every page of every workspace asks. Fails quietly: an announcement outage must never break the app. */
export async function announcementsFor(t: Pick<Tenant, "id" | "planKey">, now = new Date()): Promise<AnnouncementView[]> {
  try {
    if (!cache || now.getTime() - cache.at > 30_000) {
      const rows = await platformDb().announcement.findMany({ where: { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, orderBy: { createdAt: "desc" }, take: 50 });
      cache = { at: now.getTime(), rows };
    }
    return selectAnnouncements(cache.rows, t);
  } catch {
    return [];
  }
}
