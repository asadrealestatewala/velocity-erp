import { NextResponse, type NextRequest } from "next/server";
import { adminCan, getAdmin, platformAudit } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { tenantWhere } from "@/server/platform/tenant-list";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;

/** CSV of the workspaces matching the list filters. Contains owner contact details, so it is permission-checked and audited. */
export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminCan(admin.role, "tenants.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q");
  const sub = req.nextUrl.searchParams.get("sub");
  const rows = await platformDb().tenant.findMany({ where: { ...tenantWhere(q, sub), isLegacy: false }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
  const body = toCsv(
    ["Code", "Company", "Owner name", "Owner email", "Status", "Subscription", "Plan", "Billing", "Price", "Currency", "Trial ends", "Period ends", "Email confirmed", "Last seen", "Created"],
    rows.map((t) => [t.slug, t.name, t.ownerName, t.ownerEmail, t.status, t.subStatus, t.planKey, t.interval, t.priceAmount, t.priceCurrency, t.trialEndsAt, t.currentPeriodEnd, t.emailConfirmedAt, t.lastSeenAt, t.createdAt]),
  );
  await platformAudit({ admin, action: "tenant.list_exported", detail: { rows: rows.length, q: q ?? null, sub: sub ?? null } });
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="workspaces-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
