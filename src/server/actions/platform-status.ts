"use server";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";

const schema = z.object({
  title: z.string().trim().min(3, "Add a short title").max(100),
  body: z.string().trim().min(5, "Say what customers will notice").max(1000),
  impact: z.enum(["minor", "major"]),
});

export async function postIncidentAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const a = await requireAdminAction("status.manage");
    const v = schema.parse(input);
    const row = await platformDb().statusIncident.create({ data: { ...v, createdBy: a.email } });
    await platformAudit({ admin: a, action: "status.incident_posted", targetType: "StatusIncident", targetId: row.id, detail: { title: v.title, impact: v.impact } });
    return { ok: true as const, message: "Posted on the public status page." };
  });
}

export async function resolveIncidentAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("status.manage");
    const r = await platformDb().statusIncident.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (!r.count) throw new AppError("That incident is already resolved.", "CONFLICT");
    await platformAudit({ admin: a, action: "status.incident_resolved", targetType: "StatusIncident", targetId: id });
    return { ok: true as const, message: "Marked resolved." };
  });
}
