import "server-only";
import type { Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";
import type { CurrentUser } from "@/server/auth/session";
import { contactScope, isCentral, leadScope } from "@/server/authz";

export type ContactFilters = Partial<Record<
  | "q" | "type" | "stage" | "source" | "city" | "dealership" | "rep" | "createdFrom" | "createdTo" | "activityFrom" | "activityTo"
  | "testDrive" | "assigned" | "origin" | "archived" | "followUp" | "sort" | "dir",
  string
>>;

const d = (s?: string) => (s && !isNaN(Date.parse(s)) ? new Date(s) : undefined);

/** Lead-level filters. Central users filter on the contact's current lead; portal users on their visible leads. */
function leadFilter(f: ContactFilters): Prisma.LeadWhereInput[] {
  const out: Prisma.LeadWhereInput[] = [];
  if (f.stage) out.push({ stageId: f.stage });
  if (f.dealership) out.push({ dealershipId: f.dealership });
  if (f.rep) out.push({ assignedUserId: f.rep });
  if (f.assigned === "yes") out.push({ dealershipId: { not: null } });
  if (f.assigned === "no") out.push({ dealershipId: null });
  if (f.origin === "COMPANY" || f.origin === "DEALERSHIP_WALK_IN") out.push({ origin: f.origin });
  if (f.followUp === "due") out.push({ nextFollowUpAt: { lte: endOfDay(new Date()) }, stage: { kind: "OPEN" } });
  return out;
}

export function contactWhere(user: CurrentUser, f: ContactFilters): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [contactScope(user), { isArchived: f.archived === "yes" }];
  if (f.q) {
    const q = f.q.trim().slice(0, 100);
    const digits = normalizePhone(q);
    const parts = q.split(/\s+/).filter(Boolean);
    and.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { businessName: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ phoneNormalized: { contains: digits.slice(-9) } }] : []),
        ...(parts.length === 2
          ? [{ AND: [{ firstName: { contains: parts[0]!, mode: "insensitive" as const } }, { lastName: { contains: parts[1]!, mode: "insensitive" as const } }] }]
          : []),
      ],
    });
  }
  if (f.type === "LEAD" || f.type === "CUSTOMER") and.push({ type: f.type });
  if (f.source) and.push({ sourceId: f.source });
  if (f.city) and.push({ cityId: f.city });
  if (d(f.createdFrom)) and.push({ createdAt: { gte: startOfDay(d(f.createdFrom)!) } });
  if (d(f.createdTo)) and.push({ createdAt: { lte: endOfDay(d(f.createdTo)!) } });
  if (d(f.activityFrom)) and.push({ lastActivityAt: { gte: startOfDay(d(f.activityFrom)!) } });
  if (d(f.activityTo)) and.push({ lastActivityAt: { lte: endOfDay(d(f.activityTo)!) } });
  if (f.testDrive === "none") and.push({ testDrives: { none: {} } });
  else if (f.testDrive) and.push({ testDrives: { some: { status: f.testDrive as Prisma.EnumTestDriveStatusFilter["equals"] } } });

  const lf = leadFilter(f);
  if (lf.length) {
    if (isCentral(user)) and.push({ currentLead: { AND: lf } });
    else and.push({ leads: { some: { AND: [leadScope(user), ...lf] } } });
  }
  return { AND: and };
}

export function contactOrderBy(f: ContactFilters): Prisma.ContactOrderByWithRelationInput[] {
  const dir = f.dir === "asc" ? "asc" : "desc";
  switch (f.sort) {
    case "name":
      return [{ firstName: dir }, { lastName: dir }];
    case "activity":
      return [{ lastActivityAt: { sort: dir, nulls: "last" } }];
    case "city":
      return [{ city: { name: dir } }];
    case "type":
      return [{ type: dir }];
    default:
      return [{ createdAt: dir }];
  }
}

export const contactListInclude = (user: CurrentUser) =>
  ({
    city: { select: { name: true } },
    source: { select: { name: true } },
    avatarFile: { select: { id: true } },
    // The lead displayed in the row must itself be visible to the user (never another dealership's lead).
    leads: {
      where: leadScope(user),
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        id: true, origin: true, nextFollowUpAt: true,
        stage: { select: { name: true, color: true, kind: true } },
        dealership: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    },
  }) satisfies Prisma.ContactInclude;

export async function listContacts(user: CurrentUser, f: ContactFilters, page: number, pageSize: number) {
  const where = contactWhere(user, f);
  const [rows, total] = await Promise.all([
    db.contact.findMany({ where, orderBy: contactOrderBy(f), skip: (page - 1) * pageSize, take: pageSize, include: contactListInclude(user) }),
    db.contact.count({ where }),
  ]);
  return { rows, total };
}
