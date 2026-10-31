import "server-only";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { deliverEmail, emailConfigured } from "@/server/messaging/providers";

export const NOTIFICATION_TYPES = {
  LEAD_ASSIGNED: "New lead assignment",
  LEAD_REASSIGNED: "Lead reassignment",
  TEST_DRIVE_BOOKED: "New test-drive booking",
  TEST_DRIVE_UPCOMING: "Upcoming test drive",
  FOLLOW_UP_OVERDUE: "Overdue follow-up",
  TASK_ASSIGNED: "Task assignment",
  TASK_DUE: "Task deadline",
  STAGE_ENTERED: "Lead entered a watched stage",
  APPLICATION_STATUS: "Application status change",
  APPLICATION_INFO_REQUEST: "Additional information request",
  DEALERSHIP_ONBOARDING: "Dealership onboarding",
  MILESTONE: "Performance milestone",
  STOCK_LOW: "Low showroom stock",
  PROCUREMENT_NEW: "New dealership stock order",
  PROCUREMENT_UPDATE: "Stock order update",
  LEDGER_UPDATE: "Ledger / payment update",
  DOCUMENT_SHARED: "Document shared with you",
  MESSAGE_RECEIVED: "New customer message",
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

type Prefs = Partial<Record<NotificationType, { inApp?: boolean; email?: boolean }>>;

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  /** Relative paths; recipients in the portal get `portal`, central users get `central`. */
  link?: { central?: string; portal?: string };
  entityType?: string;
  entityId?: string;
  /** Stable key so repeated job runs don't duplicate a notification for the same user. */
  dedupeKey?: string;
};

/**
 * Creates in-app notifications and queues emails in the outbox — inside the caller's transaction,
 * so notification state can never diverge from the business change that caused it.
 */
export async function notify(tx: Tx, input: NotifyInput) {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) return;
  const users = await tx.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, email: true, notificationPrefs: true, role: { select: { scope: true } } },
  });
  const settingsRow = await tx.setting.findUnique({ where: { key: "system" } });
  const emailEnabled =
    ((settingsRow?.value as { notifications?: { emailEnabled?: boolean } } | null)?.notifications?.emailEnabled ?? true) === true;

  for (const u of users) {
    const prefs = (u.notificationPrefs ?? {}) as Prefs;
    const p = prefs[input.type] ?? {};
    const link = u.role.scope === "CENTRAL" ? input.link?.central : input.link?.portal;
    if (p.inApp !== false) {
      const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${u.id}` : null;
      if (dedupeKey) {
        const exists = await tx.notification.findUnique({ where: { dedupeKey } });
        if (exists) continue;
      }
      await tx.notification.create({
        data: {
          userId: u.id,
          type: input.type,
          title: input.title,
          body: input.body,
          link: link ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          dedupeKey,
        },
      });
    }
    if (emailEnabled && p.email !== false) {
      await tx.outboxMessage.create({
        data: {
          to: u.email,
          subject: `[Velocity ERP] ${input.title}`,
          body: `${input.body ?? input.title}${link ? `\n\nOpen: ${env.appUrl}${link}` : ""}`,
        },
      });
    }
  }
}

/** Active users of a dealership, optionally filtered to managers. */
export async function dealershipUserIds(tx: Tx, dealershipId: string, onlyManagers = false) {
  const rows = await tx.dealershipMembership.findMany({
    where: { dealershipId, isActive: true, user: { isActive: true }, ...(onlyManagers ? { role: "MANAGER" } : {}) },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Central users holding a permission (e.g. everyone who can assign leads). */
export async function centralUserIdsWith(tx: Tx, permissionKey: string) {
  const rows = await tx.user.findMany({
    where: {
      isActive: true,
      role: { scope: "CENTRAL", permissions: { some: { permission: { key: permissionKey } } } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ───────── Email delivery ─────────

/** True when email can be delivered, through Resend (RESEND_API_KEY) or SMTP (SMTP_HOST). */
export function smtpConfigured() {
  return emailConfigured();
}

/** Deliver pending outbox emails. Without Resend or SMTP they are marked SKIPPED — never reported as sent. */
export async function deliverOutbox(limit = 50) {
  const pending = await db.outboxMessage.findMany({
    where: { status: "PENDING", attempts: { lt: 5 } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (!pending.length) return { sent: 0, skipped: 0, failed: 0 };

  if (!smtpConfigured()) {
    await db.outboxMessage.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: "SKIPPED", lastError: "Email not configured" },
    });
    return { sent: 0, skipped: pending.length, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const m of pending) {
    try {
      await deliverEmail({ to: m.to, subject: m.subject, body: m.body });
      await db.outboxMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
      sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      await db.outboxMessage.update({
        where: { id: m.id },
        data: { attempts, status: attempts >= 5 ? "FAILED" : "PENDING", lastError: String((e as Error).message).slice(0, 500) },
      });
      failed++;
    }
  }
  return { sent, skipped: 0, failed };
}
