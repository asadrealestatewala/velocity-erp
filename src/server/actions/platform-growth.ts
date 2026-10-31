"use server";
import { z } from "zod";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { isSegment, segmentMembers, sendCampaign, SEGMENTS } from "@/server/platform/campaigns";

export async function markDemoHandledAction(id: string, handled: boolean) {
  return runAction(async () => {
    const a = await requireAdminAction("reports");
    await platformDb().demoRequest.update({ where: { id }, data: handled ? { handledAt: new Date(), handledBy: a.email } : { handledAt: null, handledBy: null } });
    await platformAudit({ admin: a, action: handled ? "demo.handled" : "demo.reopened", targetType: "DemoRequest", targetId: id });
    return { ok: true as const };
  });
}

const campaignSchema = z.object({
  name: z.string().trim().min(3, "Give it a name so you can find it later").max(80),
  segment: z.string().refine(isSegment, "Choose who receives it"),
  subject: z.string().trim().min(3, "Add a subject").max(120),
  body: z.string().trim().min(10, "Write the message").max(4000),
});

/** Saves a draft; nothing is sent until the owner presses Send. */
export async function saveCampaignAction(input: z.input<typeof campaignSchema>) {
  return runAction(async () => {
    const a = await requireAdminAction("campaigns.send");
    const v = campaignSchema.parse(input);
    const row = await platformDb().campaign.create({ data: { ...v, createdBy: a.email } });
    await platformAudit({ admin: a, action: "campaign.drafted", targetType: "Campaign", targetId: row.id, detail: { segment: v.segment } });
    return { ok: true as const, message: "Draft saved. Review the audience below, then send." };
  });
}

export async function deleteCampaignDraftAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("campaigns.send");
    const r = await platformDb().campaign.deleteMany({ where: { id, sentAt: null } });
    if (!r.count) throw new AppError("Only drafts can be deleted.", "CONFLICT");
    await platformAudit({ admin: a, action: "campaign.deleted", targetType: "Campaign", targetId: id });
    return { ok: true as const, message: "Draft deleted." };
  });
}

export async function sendCampaignAction(id: string) {
  return runAction(async () => {
    const a = await requireAdminAction("campaigns.send");
    const c = await platformDb().campaign.findUnique({ where: { id } });
    if (!c) throw new AppError("That campaign no longer exists.", "NOT_FOUND");
    if (c.sentAt) throw new AppError("This campaign was already sent.", "CONFLICT");
    const count = (await segmentMembers(c.segment as keyof typeof SEGMENTS)).length;
    await platformAudit({ admin: a, action: "campaign.sending", targetType: "Campaign", targetId: id, detail: { segment: c.segment, recipients: count } });
    const r = await sendCampaign(id);
    if (r === "already-sent") throw new AppError("This campaign was already sent.", "CONFLICT");
    await platformAudit({ admin: a, action: "campaign.sent", targetType: "Campaign", targetId: id, detail: r });
    return { ok: true as const, message: `Sent to ${r.sent} workspace${r.sent === 1 ? "" : "s"}${r.failed ? `; ${r.failed} could not be delivered` : ""}.` };
  });
}
