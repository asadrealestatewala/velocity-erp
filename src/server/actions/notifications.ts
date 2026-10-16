"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { runAction } from "@/server/errors";
import { NOTIFICATION_TYPES } from "@/server/services/notifications";

export async function markNotificationsReadAction(ids: string[] | "all") {
  return runAction(async () => {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { userId: user.id, isRead: false, ...(ids === "all" ? {} : { id: { in: z.array(z.string()).max(500).parse(ids) } }) },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true as const };
  });
}

export async function markNotificationUnreadAction(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    await db.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: false, readAt: null } });
    return { ok: true as const };
  });
}

const prefsSchema = z.record(z.enum(Object.keys(NOTIFICATION_TYPES) as [keyof typeof NOTIFICATION_TYPES]), z.object({ inApp: z.boolean(), email: z.boolean() }));

export async function saveNotificationPrefsAction(prefs: z.input<typeof prefsSchema>) {
  return runAction(async () => {
    const user = await requireUser();
    await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefsSchema.parse(prefs) } });
    return { ok: true as const, message: "Notification preferences saved." };
  });
}
