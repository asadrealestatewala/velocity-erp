import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { can, managedDealershipIds, requirePortalPage } from "@/server/authz";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { TeamPanel } from "@/components/dealerships/dealership-controls";
import { pct } from "@/lib/utils";

export const metadata = { title: "Team performance" };

export default async function TeamPage() {
  const user = await requirePortalPage();
  const managed = managedDealershipIds(user);
  if (!managed.length) {
    return <div className="card p-8 text-center text-sm text-ink-500">Team performance is available to dealership managers.</div>;
  }
  const since = subDays(new Date(), 30);
  const dealers = await db.dealership.findMany({
    where: { id: { in: managed } },
    include: { memberships: { orderBy: [{ isActive: "desc" }, { role: "asc" }], include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } } } },
  });

  return (
    <>
      <PageHeader title="Team performance" description="Last 30 days. Individual performance is visible only to your dealership's managers." />
      {await Promise.all(dealers.map(async (d) => {
        const userIds = d.memberships.filter((m) => m.isActive).map((m) => m.userId);
        const [assigned, contacted, converted, tds, tasksDue, tasksOnTime, overdue, points] = await Promise.all([
          db.lead.groupBy({ by: ["assignedUserId"], where: { dealershipId: d.id, assignedUserId: { in: userIds }, assignedAt: { gte: since } }, _count: { _all: true } }),
          db.lead.groupBy({ by: ["assignedUserId"], where: { dealershipId: d.id, assignedUserId: { in: userIds }, firstContactedAt: { gte: since } }, _count: { _all: true } }),
          db.lead.groupBy({ by: ["assignedUserId"], where: { dealershipId: d.id, assignedUserId: { in: userIds }, convertedAt: { gte: since }, stage: { kind: "WON" } }, _count: { _all: true } }),
          db.testDriveBooking.groupBy({ by: ["assignedUserId"], where: { dealershipId: d.id, assignedUserId: { in: userIds }, status: "COMPLETED", completedAt: { gte: since } }, _count: { _all: true } }),
          db.task.groupBy({ by: ["assignedToId"], where: { dealershipId: d.id, assignedToId: { in: userIds }, dueAt: { gte: since, lte: new Date() }, status: { not: "CANCELLED" } }, _count: { _all: true } }),
          db.task.findMany({ where: { dealershipId: d.id, assignedToId: { in: userIds }, dueAt: { gte: since, lte: new Date() }, status: "COMPLETED" }, select: { assignedToId: true, completedAt: true, dueAt: true } }),
          db.task.groupBy({ by: ["assignedToId"], where: { dealershipId: d.id, assignedToId: { in: userIds }, status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: new Date() } }, _count: { _all: true } }),
          db.gamificationEvent.groupBy({ by: ["userId"], where: { dealershipId: d.id, userId: { in: userIds }, createdAt: { gte: since } }, _sum: { points: true } }),
        ]);
        const n = (rows: { assignedUserId?: string | null; assignedToId?: string; _count: { _all: number } }[], id: string) => rows.find((r) => (r.assignedUserId ?? r.assignedToId) === id)?._count._all ?? 0;
        return (
          <div key={d.id} className="mb-6 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={d.name} description="Per-representative activity" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-ink-50/60"><tr><th className="th">Member</th><th className="th text-right">Leads assigned</th><th className="th text-right">Contacted</th><th className="th text-right">Converted</th><th className="th text-right">Test drives</th><th className="th text-right">On-time follow-ups</th><th className="th text-right">Overdue</th><th className="th text-right">Points</th></tr></thead>
                  <tbody className="divide-y divide-ink-100">
                    {d.memberships.filter((m) => m.isActive).map((m) => {
                      const due = tasksDue.find((t) => t.assignedToId === m.userId)?._count._all ?? 0;
                      const onTime = tasksOnTime.filter((t) => t.assignedToId === m.userId && t.completedAt && t.completedAt <= t.dueAt).length;
                      return (
                        <tr key={m.id}>
                          <td className="td"><p className="font-medium">{m.user.name}</p><p className="text-xs text-ink-400">{m.role === "MANAGER" ? "Manager" : "Sales rep"}</p></td>
                          <td className="td text-right tabular-nums">{n(assigned, m.userId)}</td>
                          <td className="td text-right tabular-nums">{n(contacted, m.userId)}</td>
                          <td className="td text-right tabular-nums">{n(converted, m.userId)}</td>
                          <td className="td text-right tabular-nums">{n(tds, m.userId)}</td>
                          <td className="td text-right tabular-nums">{onTime}/{due} <span className="text-ink-400">({pct(onTime, due)}%)</span></td>
                          <td className="td text-right tabular-nums">{n(overdue, m.userId) ? <span className="font-semibold text-red-600">{n(overdue, m.userId)}</span> : 0}</td>
                          <td className="td text-right font-semibold tabular-nums">{points.find((p) => p.userId === m.userId)?._sum.points ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeader title="Team members" description="Add or remove sales representatives" />
              {can(user, "team.manage") ? <TeamPanel dealershipId={d.id} members={d.memberships} canAppointManagers={false} meId={user.id} /> : null}
            </Card>
          </div>
        );
      }))}
    </>
  );
}
