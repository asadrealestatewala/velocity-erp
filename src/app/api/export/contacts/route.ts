import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, leadScope } from "@/server/authz";
import { contactOrderBy, contactWhere, type ContactFilters } from "@/server/queries/contacts";
import { audit } from "@/server/audit";
import { fullName } from "@/lib/utils";

const MAX_ROWS = 10_000;

/** Neutralises spreadsheet formula injection and escapes CSV special characters. */
function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "contacts.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const f = Object.fromEntries(req.nextUrl.searchParams.entries()) as ContactFilters;
  const where = contactWhere(user, f);
  const rows = await db.contact.findMany({
    where,
    orderBy: contactOrderBy(f),
    take: MAX_ROWS,
    include: {
      city: { select: { name: true } },
      source: { select: { name: true } },
      leads: {
        where: leadScope(user),
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { stage: { select: { name: true } }, dealership: { select: { name: true } }, assignedUser: { select: { name: true } }, interestedModel: { select: { name: true } } },
      },
    },
  });

  const header = ["Contact ID", "Name", "Phone", "Email", "Type", "Source", "Stage", "City", "Dealership", "Lead origin", "Sales rep", "Interested model", "Marketing consent", "Created at", "Last activity"];
  const lines = [header.join(",")];
  for (const c of rows) {
    const l = c.leads[0];
    lines.push(
      [c.id, fullName(c), c.phone, c.email, c.type, c.source?.name, l?.stage.name, c.city?.name, l?.dealership?.name ?? (l ? "Unassigned" : ""), l?.origin, l?.assignedUser?.name, l?.interestedModel?.name, c.consentMarketing ? "Yes" : "No", c.createdAt, c.lastActivityAt]
        .map(cell)
        .join(","),
    );
  }
  await audit({ userId: user.id, action: "contacts.exported", entityType: "Contact", changes: { filters: f, rows: rows.length } });

  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
