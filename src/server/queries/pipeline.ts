import "server-only";
import type { Prisma } from "@prisma/client";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { leadScope } from "@/server/authz";

export type PipelineFilters = Partial<Record<"source" | "city" | "dealership" | "owner" | "from" | "to" | "origin" | "q" | "closedDays", string>>;

export function pipelineWhere(user: CurrentUser, f: PipelineFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [leadScope(user), { isArchived: false }];
  if (f.source) and.push({ sourceId: f.source });
  if (f.city) and.push({ cityId: f.city });
  if (f.dealership === "none") and.push({ dealershipId: null });
  else if (f.dealership) and.push({ dealershipId: f.dealership });
  if (f.owner) and.push({ OR: [{ ownerId: f.owner }, { assignedUserId: f.owner }] });
  if (f.origin === "COMPANY" || f.origin === "DEALERSHIP_WALK_IN") and.push({ origin: f.origin });
  if (f.from && !isNaN(Date.parse(f.from))) and.push({ createdAt: { gte: startOfDay(new Date(f.from)) } });
  if (f.to && !isNaN(Date.parse(f.to))) and.push({ createdAt: { lte: endOfDay(new Date(f.to)) } });
  if (f.q) {
    const q = f.q.trim().slice(0, 80);
    and.push({ contact: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } });
  }
  return { AND: and };
}

const PER_COLUMN = 60;

/** Leads grouped by stage. Closed stages (won/lost) only show recently closed leads to keep the board useful. */
export async function getBoard(user: CurrentUser, f: PipelineFilters) {
  const stages = await db.leadStage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const where = pipelineWhere(user, f);
  const closedSince = subDays(new Date(), Number(f.closedDays) || 30);
  const columns = await Promise.all(
    stages.map(async (s) => {
      const stageWhere: Prisma.LeadWhereInput = { AND: [where, { stageId: s.id }, s.kind === "OPEN" ? {} : { stageChangedAt: { gte: closedSince } }] };
      const [leads, count] = await Promise.all([
        db.lead.findMany({
          where: stageWhere,
          orderBy: { stageChangedAt: "desc" },
          take: PER_COLUMN,
          select: {
            id: true, number: true, origin: true, createdAt: true, stageChangedAt: true, nextFollowUpAt: true, conversionValue: true, dealershipId: true,
            contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
            dealership: { select: { name: true } },
            assignedUser: { select: { name: true } },
            interestedModel: { select: { name: true } },
            source: { select: { name: true } },
          },
        }),
        db.lead.count({ where: stageWhere }),
      ]);
      return {
        stage: { id: s.id, name: s.name, color: s.color, kind: s.kind },
        count,
        leads: leads.map((l) => ({ ...l, conversionValue: l.conversionValue ? Number(l.conversionValue) : null })),
      };
    }),
  );
  return columns;
}

export type BoardColumn = Awaited<ReturnType<typeof getBoard>>[number];
