import Link from "next/link";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/table";
import { cn, fmtDateTime, fmtRelative } from "@/lib/utils";
import { NOTIFICATION_TYPES } from "@/server/services/notifications";
import { MarkAllRead, NotificationLink } from "./notification-actions";

export async function NotificationsView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 30;
  const where = { userId: user.id, ...(params.filter === "unread" ? { isRead: false } : {}) };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${unread} unread`}
        actions={
          <>
            <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
              <Link href={`${base}/notifications`} className={cn("rounded-md px-3 py-1.5", params.filter !== "unread" ? "bg-ink-900 text-white" : "text-ink-600")}>All</Link>
              <Link href={`${base}/notifications?filter=unread`} className={cn("rounded-md px-3 py-1.5", params.filter === "unread" ? "bg-ink-900 text-white" : "text-ink-600")}>Unread</Link>
            </div>
            {unread > 0 && <MarkAllRead />}
            <Link href={`${base}/account#notifications`} className="text-sm font-medium text-brand-600 hover:underline">Preferences</Link>
          </>
        }
      />
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" description="Assignments, bookings, reminders and milestones will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-5 py-4", !n.isRead && "bg-brand-50/40")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.isRead ? "bg-ink-200" : "bg-brand-500")} aria-label={n.isRead ? "Read" : "Unread"} />
                <div className="min-w-0 flex-1">
                  <NotificationLink id={n.id} href={n.link} isRead={n.isRead}>
                    <p className={cn("text-sm", n.isRead ? "text-ink-700" : "font-semibold text-ink-900")}>{n.title}</p>
                  </NotificationLink>
                  {n.body && <p className="text-sm text-ink-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-400" title={fmtDateTime(n.createdAt)}>
                    {NOTIFICATION_TYPES[n.type as keyof typeof NOTIFICATION_TYPES] ?? n.type} · {fmtRelative(n.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination base={`${base}/notifications`} params={params} page={page} pageSize={pageSize} total={total} sizes={[30]} />
      </div>
    </>
  );
}
