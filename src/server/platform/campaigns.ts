import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Tenant } from "@yadea/platform-client";
import { env } from "@/lib/env";
import { platformDb } from "./client";
import { appBaseUrl, renderMail, sendSystemMail } from "./mail";

export const SEGMENTS = {
  active: "Paying customers",
  trialing: "Everyone on a free trial",
  trialEnding: "Trials ending within 7 days",
  pastDue: "Payment overdue",
  inactive: "Not signed in for 30 days",
} as const;
export type Segment = keyof typeof SEGMENTS;
export const isSegment = (s: string): s is Segment => s in SEGMENTS;

const DAY = 86_400_000;

type Row = Pick<Tenant, "id" | "slug" | "name" | "ownerName" | "ownerEmail" | "subStatus" | "trialEndsAt" | "lastSeenAt" | "createdAt" | "status" | "marketingOptOutAt">;

/** Pure rule for who belongs to a segment. Opted-out workspaces, suspended ones and ones without an owner address are never included. */
export function inSegment(t: Row, seg: Segment, now = new Date()): boolean {
  if (t.marketingOptOutAt || !t.ownerEmail || t.status !== "ACTIVE") return false;
  switch (seg) {
    case "active": return t.subStatus === "ACTIVE";
    case "trialing": return t.subStatus === "TRIALING";
    case "trialEnding": return t.subStatus === "TRIALING" && !!t.trialEndsAt && t.trialEndsAt > now && t.trialEndsAt.getTime() - now.getTime() <= 7 * DAY;
    case "pastDue": return t.subStatus === "PAST_DUE";
    case "inactive": return ["ACTIVE", "TRIALING"].includes(t.subStatus) && (t.lastSeenAt ?? t.createdAt).getTime() < now.getTime() - 30 * DAY;
  }
}

export async function segmentMembers(seg: Segment, now = new Date()) {
  const all = await platformDb().tenant.findMany({
    where: { isLegacy: false },
    select: { id: true, slug: true, name: true, ownerName: true, ownerEmail: true, subStatus: true, trialEndsAt: true, lastSeenAt: true, createdAt: true, status: true, marketingOptOutAt: true },
  });
  return all.filter((t) => inSegment(t, seg, now));
}

const sig = (tenantId: string) => createHmac("sha256", env.appSecret).update(`unsubscribe:${tenantId}`).digest("base64url");
export const unsubscribeUrl = (tenantId: string) => `${appBaseUrl()}/unsubscribe/${tenantId}/${sig(tenantId)}`;
export function verifyUnsubscribe(tenantId: string, given: string): boolean {
  const a = Buffer.from(sig(tenantId));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function optOut(tenantId: string, at = new Date()) {
  await platformDb().tenant.updateMany({ where: { id: tenantId, marketingOptOutAt: null }, data: { marketingOptOutAt: at } });
}

const merge = (s: string, t: Row) => s.replaceAll("{{name}}", t.ownerName?.split(" ")[0] || "there").replaceAll("{{company}}", t.name);

/**
 * Sends a campaign once. The first caller atomically claims it (`sentAt` is set only while empty), so a double click or a retry
 * cannot send it twice. Every email carries a signed unsubscribe link, and opted-out workspaces are skipped.
 */
export async function sendCampaign(id: string, now = new Date()): Promise<{ sent: number; failed: number } | "already-sent"> {
  const db = platformDb();
  const claimed = await db.campaign.updateMany({ where: { id, sentAt: null }, data: { sentAt: now } });
  if (claimed.count === 0) return "already-sent";
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  const members = await segmentMembers(c.segment as Segment, now);
  let delivered = 0;
  let failed = 0;
  for (const t of members) {
    try {
      const link = unsubscribeUrl(t.id);
      const paragraphs = merge(c.body, t).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      const mail = await renderMail({ heading: merge(c.subject, t), paragraphs, footer: `You are receiving this because you have a workspace on our platform. Unsubscribe from product news: ${link}` });
      const r = await sendSystemMail({ to: t.ownerEmail!, subject: merge(c.subject, t), category: "onboarding", templateKey: `campaign:${c.id}`, tenantId: t.id, text: `${paragraphs.join("\n\n")}\n\n—\nUnsubscribe from product news: ${link}`, html: mail.html });
      if (r.delivered) delivered++; else failed++;
    } catch {
      failed++;
    }
  }
  await db.campaign.update({ where: { id }, data: { recipients: members.length, delivered, failed } });
  return { sent: delivered, failed };
}
