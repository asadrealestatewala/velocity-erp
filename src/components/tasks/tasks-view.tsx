import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { endOfDay, endOfWeek, startOfDay } from "date-fns";
import { CheckSquare } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { isCentral, taskScope } from "@/server/authz";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/table";
import { cn, fmtDateTime, fullName } from "@/lib/utils";
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPES } from "@/lib/constants";
import { TaskRowActions, NewTaskButton } from "./task-actions";

export async function TasksView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Number(params.pageSize) || 25);
  const now = new Date();
  const and: Prisma.TaskWhereInput[] = [taskScope(user)];
  const status = params.status ?? "open";
  if (status === "open") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (status !== "all") and.push({ status: status as "OPEN" });
  if (params.type) and.push({ type: params.type as "CALL" });
  if (params.assignee === "me") and.push({ assignedToId: user.id });
  else if (params.assignee) and.push({ assignedToId: params.assignee });
  if (params.due === "overdue") and.push({ dueAt: { lt: now }, status: { in: ["OPEN", "IN_PROGRESS"] } });
  if (params.due === "today") and.push({ dueAt: { gte: startOfDay(now), lte: endOfDay(now) } });
  if (params.due === "week") and.push({ dueAt: { gte: startOfDay(now), lte: endOfWeek(now, { weekStartsOn: 1 }) } });
  if (params.priority) and.push({ priority: params.priority as "HIGH" });
  const where = { AND: and };

  const peopleWhere: Prisma.UserWhereInput = isCentral(user)
    ? { isActive: true }
    : { isActive: true, memberships: { some: { dealershipId: { in: user.memberships.map((m) => m.dealershipId) }, isActive: true } } };
  const [rows, total, overdue, people] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ dueAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedTo: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, dealership: { select: { name: true } } },
    }),
    db.task.count({ where }),
    db.task.count({ where: { AND: [taskScope(user), { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } }] } }),
    db.user.findMany({ where: peopleWhere, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Tasks & follow-ups"
        description={overdue ? `${overdue} overdue task(s) need attention` : "You're all caught up on overdue work"}
        actions={<NewTaskButton people={people} meId={user.id} />}
      />
      <FilterBar
        filters={[
          { type: "select", name: "status", label: "Open tasks", options: [{ value: "all", label: "All statuses" }, ...Object.entries(TASK_STATUS).map(([k, v]) => ({ value: k, label: v.label }))] },
          { type: "select", name: "due", label: "Any due date", options: [{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "week", label: "This week" }] },
          { type: "select", name: "assignee", label: "Anyone", options: [{ value: "me", label: "Assigned to me" }, ...people.map((p) => ({ value: p.id, label: p.name }))] },
          { type: "select", name: "type", label: "Any type", options: Object.entries(TASK_TYPES).map(([k, l]) => ({ value: k, label: l })) },
          { type: "select", name: "priority", label: "Any priority", options: Object.entries(TASK_PRIORITY).map(([k, v]) => ({ value: k, label: v.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={CheckSquare} title="No tasks here" description="Tasks created from contacts, follow-ups and test drives appear in this list." /></div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-ink-100">
            {rows.map((t) => {
              const open = t.status === "OPEN" || t.status === "IN_PROGRESS";
              const late = open && t.dueAt < now;
              return (
                <li key={t.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap", late && "bg-red-50/40")}>
                  <TaskRowActions taskId={t.id} status={t.status} mode="check" />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", open ? "text-ink-900" : "text-ink-400 line-through")}>{t.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {t.contact ? <Link href={`${base}/contacts/${t.contact.id}?tab=tasks`} className="hover:underline">{fullName(t.contact)}</Link> : "No contact"}
                      {" · "}{t.assignedTo.name}{t.dealership ? ` · ${t.dealership.name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="gray">{TASK_TYPES[t.type]}</Badge>
                    <Badge tone={TASK_PRIORITY[t.priority]!.tone}>{TASK_PRIORITY[t.priority]!.label}</Badge>
                    {!open && <Badge tone={TASK_STATUS[t.status]!.tone}>{TASK_STATUS[t.status]!.label}</Badge>}
                  </div>
                  <span className={cn("w-40 text-right text-xs whitespace-nowrap", late ? "font-semibold text-red-600" : "text-ink-500")}>{late ? "Overdue · " : ""}{fmtDateTime(t.dueAt)}</span>
                  <TaskRowActions taskId={t.id} status={t.status} mode="menu" />
                </li>
              );
            })}
          </ul>
          <Pagination base={`${base}/tasks`} params={params} page={page} pageSize={pageSize} total={total} />
        </div>
      )}
    </>
  );
}
