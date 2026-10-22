import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type FunnelStage = { id: string; name: string; color: string; kind: "OPEN" | "WON" | "LOST"; atStage: number; reached: number; ofTotalPct: number; stepPct: number | null };

/**
 * The funnel is built from the pipeline's own stage definitions (LeadStage, in sortOrder), never a hardcoded list.
 * "Reached" = leads currently at that stage or any later non-lost stage — the pipeline is linear, so a lead
 * sitting at Qualified has necessarily passed New and Contacted. Lost leads are reported separately.
 */
export async function getFunnel(leadWhere: Prisma.LeadWhereInput) {
  const [stages, groups] = await Promise.all([
    db.leadStage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true, kind: true } }),
    db.lead.groupBy({ by: ["stageId"], where: { AND: [leadWhere, { isArchived: false }] }, _count: { _all: true } }),
  ]);
  const at = new Map(groups.map((g) => [g.stageId, g._count._all]));
  const flow = stages.filter((s) => s.kind !== "LOST");
  const lost = stages.filter((s) => s.kind === "LOST").reduce((a, s) => a + (at.get(s.id) ?? 0), 0);
  const total = flow.reduce((a, s) => a + (at.get(s.id) ?? 0), 0);
  const out: FunnelStage[] = flow.map((s, i) => {
    const reached = flow.slice(i).reduce((a, x) => a + (at.get(x.id) ?? 0), 0);
    return { ...s, atStage: at.get(s.id) ?? 0, reached, ofTotalPct: total ? Math.round((reached / total) * 100) : 0, stepPct: null };
  });
  out.forEach((s, i) => {
    s.stepPct = i === 0 ? null : out[i - 1]!.reached ? Math.round((s.reached / out[i - 1]!.reached) * 100) : null;
  });
  return { stages: out, total, lost };
}
