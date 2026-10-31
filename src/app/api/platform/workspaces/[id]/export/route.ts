import { NextResponse, type NextRequest } from "next/server";
import { adminCan, getAdmin, platformAudit } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { workspaceExportStream } from "@/server/platform/export";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Full data export of one workspace (owner-only, reason required, audited). POST so the reason travels in the body, not the URL. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.role, "tenants.export")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const reason = String((await req.formData()).get("reason") ?? "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  const { id } = await ctx.params;
  const t = await platformDb().tenant.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (t.dataPurgedAt) return NextResponse.json({ error: "This workspace's data has been deleted." }, { status: 410 });
  await platformAudit({ admin, action: "tenant.exported", targetType: "Tenant", targetId: id, reason: reason.slice(0, 300), detail: { slug: t.slug } });
  return new NextResponse(workspaceExportStream(t), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${t.slug}-export-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "private, no-store" },
  });
}
