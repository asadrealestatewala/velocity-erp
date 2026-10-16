import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";
import { getDealershipPerformance, parseRange } from "@/server/services/analytics";
import { audit } from "@/server/audit";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Aggregated dealership performance (no personal data). Portal users get their own dealership only. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "reports.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRange(p, 30);
  const rows = await getDealershipPerformance({ ...range, cityId: p.city || undefined }, isCentral(user) ? undefined : dealershipIds(user));
  const header = ["Dealership", "Code", "City", "Leads", "Converted", "Conversion %", "Test drives completed", "Test-drive completion %", "Avg first response (h)", "Points", "Recognised revenue"];
  const lines = [header.join(","), ...rows.map((r) => [r.name, r.code, r.city, r.leads, r.converted, r.conversionRate, r.testDrivesCompleted, r.testDriveCompletionRate, r.avgResponseHours ?? "", r.points, r.revenue].map(cell).join(","))];
  await audit({ userId: user.id, action: "report.exported", entityType: "Report", changes: { report: "dealership_performance", from: range.from.toISOString(), to: range.to.toISOString() } });
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dealership-performance-${range.to.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
