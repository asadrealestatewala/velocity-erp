import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { centralUserIdsWith, dealershipUserIds, deliverOutbox, notify } from "./notifications";

/**
 * Periodic work. Safe to run repeatedly (every 5–15 minutes): each reminder is stamped
 * (reminderSentAt / overdueNotifiedAt) and notification dedupe keys prevent duplicates.
 */
export async function runScheduledJobs() {
  const now = new Date();
  const settings = await getSettings();
  let reminders = 0;
  let overdue = 0;
  let upcomingTestDrives = 0;

  // 1. Task reminders (before the due time)
  const due = await db.task.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, reminderMinutesBefore: { not: null }, reminderSentAt: null, dueAt: { gt: now } },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    take: 500,
  });
  for (const t of due) {
    if (t.dueAt.getTime() - (t.reminderMinutesBefore ?? 0) * 60_000 > now.getTime()) continue;
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
      await notify(tx, {
        userIds: [t.assignedToId], type: "TASK_DUE", title: `Due soon: ${t.title}`,
        body: `${t.contact ? `${t.contact.firstName} ${t.contact.lastName ?? ""} · ` : ""}due ${t.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
        link: { central: t.contact ? `/crm/contacts/${t.contact.id}?tab=tasks` : "/crm/tasks", portal: t.contact ? `/portal/contacts/${t.contact.id}?tab=tasks` : "/portal/tasks" },
        entityType: "Task", entityId: t.id, dedupeKey: `task-due:${t.id}`,
      });
    });
    reminders++;
  }

  // 2. Overdue follow-ups (once per task; managers of the dealership are informed too)
  const late = await db.task.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now }, overdueNotifiedAt: null },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    take: 500,
  });
  for (const t of late) {
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: t.id }, data: { overdueNotifiedAt: now } });
      const managers = t.dealershipId ? await dealershipUserIds(tx, t.dealershipId, true) : [];
      await notify(tx, {
        userIds: [t.assignedToId, ...managers], type: "FOLLOW_UP_OVERDUE", title: `Overdue: ${t.title}`,
        body: t.contact ? `${t.contact.firstName} ${t.contact.lastName ?? ""}` : undefined,
        link: { central: t.contact ? `/crm/contacts/${t.contact.id}?tab=tasks` : "/crm/tasks?due=overdue", portal: t.contact ? `/portal/contacts/${t.contact.id}?tab=tasks` : "/portal/tasks?due=overdue" },
        entityType: "Task", entityId: t.id, dedupeKey: `task-overdue:${t.id}`,
      });
    });
    overdue++;
  }

  // 3. Upcoming test drives
  const horizon = new Date(now.getTime() + settings.notifications.upcomingTestDriveHours * 3600_000);
  const tds = await db.testDriveBooking.findMany({
    where: { status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] }, scheduledAt: { gt: now, lte: horizon }, reminderSentAt: null },
    include: { contact: { select: { id: true, firstName: true, lastName: true } }, bikeModel: { select: { name: true } } },
    take: 500,
  });
  for (const b of tds) {
    await db.$transaction(async (tx) => {
      await tx.testDriveBooking.update({ where: { id: b.id }, data: { reminderSentAt: now } });
      const recipients = b.assignedUserId ? [b.assignedUserId, ...(await dealershipUserIds(tx, b.dealershipId, true))] : await dealershipUserIds(tx, b.dealershipId);
      await notify(tx, {
        userIds: recipients, type: "TEST_DRIVE_UPCOMING",
        title: `${b.status === "CONFIRMED" ? "Upcoming" : "Unconfirmed"} test drive: ${b.contact.firstName} ${b.contact.lastName ?? ""}`,
        body: `${b.bikeModel.name} · ${b.scheduledAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${b.status !== "CONFIRMED" ? " — still awaiting confirmation" : ""}`,
        link: { portal: `/portal/test-drives?focus=${b.id}`, central: `/crm/test-drives?focus=${b.id}` },
        entityType: "TestDriveBooking", entityId: b.id, dedupeKey: `td-upcoming:${b.id}`,
      });
    });
    upcomingTestDrives++;
  }

  // 4. Stock orders: deliveries past their promised date (once per order and date) and deliveries the dealership has not confirmed
  let lateDeliveries = 0;
  let receiptReminders = 0;
  const today = new Date(now.toDateString());
  const lateOrders = await db.procurementOrder.findMany({
    where: { status: "APPROVED", expectedDeliveryDate: { lt: today } },
    include: { dealership: { select: { name: true } } },
    take: 200,
  });
  for (const o of lateOrders) {
    await db.$transaction(async (tx) => {
      const day = o.expectedDeliveryDate!.toISOString().slice(0, 10);
      await notify(tx, {
        userIds: await centralUserIdsWith(tx, "procurement.manage"), type: "PROCUREMENT_UPDATE",
        title: `PO-${o.number} for ${o.dealership.name} is overdue`, body: `Promised for ${day}; still ${o.dispatchStatus.replace("_", " ").toLowerCase()}.`,
        link: { central: `/procurement/orders/${o.id}` }, entityType: "ProcurementOrder", entityId: o.id, dedupeKey: `po-overdue:${o.id}:${day}`,
      });
      await notify(tx, {
        userIds: await dealershipUserIds(tx, o.dealershipId, true), type: "PROCUREMENT_UPDATE",
        title: `Stock order PO-${o.number} is running late`, body: "Procurement has been alerted. Contact them if you need an update.",
        link: { portal: `/portal/stock-orders/${o.id}` }, entityType: "ProcurementOrder", entityId: o.id, dedupeKey: `po-overdue-dealer:${o.id}:${day}`,
      });
    });
    lateDeliveries++;
  }
  const unconfirmed = await db.procurementOrder.findMany({
    where: { status: "DELIVERED", receivedById: null, deliveredAt: { lt: new Date(now.getTime() - 2 * 86400_000) } },
    take: 200,
  });
  for (const o of unconfirmed) {
    await db.$transaction(async (tx) => {
      await notify(tx, {
        userIds: await dealershipUserIds(tx, o.dealershipId, true), type: "PROCUREMENT_UPDATE",
        title: `Please confirm receipt of PO-${o.number}`, body: "It was delivered but your stock has not been updated yet.",
        link: { portal: `/portal/stock-orders/${o.id}` }, entityType: "ProcurementOrder", entityId: o.id, dedupeKey: `po-confirm-receipt:${o.id}`,
      });
    });
    receiptReminders++;
  }

  // 5. Email delivery (SKIPPED without SMTP — never reported as sent)
  const email = await deliverOutbox(200);

  // 6. Housekeeping
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } });

  return { reminders, overdue, upcomingTestDrives, lateDeliveries, receiptReminders, email };
}
