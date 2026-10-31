import "server-only";
import { platformDb } from "./client";
import { getPlatformSettings } from "./settings";

export type Level = "ok" | "degraded" | "down";
export type Component = { key: string; label: string; level: Level; note?: string };

/** What the public page shows. Only facts the platform can verify itself: it never reports "all good" for something it did not check. */
export async function currentStatus(): Promise<{ overall: Level; components: Component[]; open: Awaited<ReturnType<typeof openIncidents>>; checkedAt: Date }> {
  const components: Component[] = [];
  let dbOk = true;
  try {
    await platformDb().$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  components.push({ key: "app", label: "Website and sign-in", level: dbOk ? "ok" : "down" });
  components.push({ key: "db", label: "Customer data", level: dbOk ? "ok" : "down", note: dbOk ? undefined : "We cannot reach the database right now." });
  let maintenance = false;
  let message = "";
  if (dbOk) {
    try {
      const s = await getPlatformSettings();
      maintenance = s.maintenance.on;
      message = s.maintenance.message;
    } catch { /* leave as not in maintenance */ }
  }
  components.push({ key: "edit", label: "Saving changes", level: maintenance ? "degraded" : dbOk ? "ok" : "down", note: maintenance ? message : undefined });
  const open = dbOk ? await openIncidents() : [];
  const worst = (l: Level[]): Level => (l.includes("down") ? "down" : l.includes("degraded") ? "degraded" : "ok");
  const incidentLevel: Level = open.some((i) => i.impact === "major") ? "down" : open.length ? "degraded" : "ok";
  return { overall: worst([...components.map((c) => c.level), incidentLevel]), components, open, checkedAt: new Date() };
}

export const openIncidents = () => platformDb().statusIncident.findMany({ where: { resolvedAt: null }, orderBy: { startedAt: "desc" } });

export const recentIncidents = (days = 30, now = new Date()) =>
  platformDb().statusIncident.findMany({ where: { resolvedAt: { not: null }, startedAt: { gte: new Date(now.getTime() - days * 86_400_000) } }, orderBy: { startedAt: "desc" }, take: 30 });
