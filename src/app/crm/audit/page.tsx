import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { FilterBar } from "@/components/filters/filter-bar";
import { PageHeader } from "@/components/ui/misc";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("audit.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 50 });
  const where: Prisma.AuditLogWhereInput = {
    ...(p.entity ? { entityType: p.entity } : {}),
    ...(p.user ? { userId: p.user } : {}),
    ...(p.q ? { action: { contains: p.q, mode: "insensitive" } } : {}),
    ...(p.entityId ? { entityId: p.entityId } : {}),
  };
  const [rows, total, entities, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: { select: { name: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"] }),
    db.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" description="Sensitive actions: sign-ins, assignments, exports, permission and settings changes" breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Audit log" }]} />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Action", placeholder: "Action contains…" },
        { type: "select", name: "entity", label: "Any entity", options: entities.map((e) => ({ value: e.entityType, label: e.entityType })) },
        { type: "select", name: "user", label: "Any user", options: users.map((u) => ({ value: u.id, label: u.name })) },
      ]} />
      <TableWrap footer={<Pagination base="/crm/audit" params={p} page={page} pageSize={pageSize} total={total} sizes={[50, 100]} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="td text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
              <td className="td">{r.user?.name ?? "System"}</td>
              <td className="td font-mono text-xs">{r.action}</td>
              <td className="td text-xs">{r.entityType}{r.entityId && <p className="font-mono text-[11px] text-ink-400">{r.entityId}</p>}</td>
              <td className="td max-w-md"><pre className="max-h-32 overflow-auto rounded bg-ink-50 p-2 text-[11px] whitespace-pre-wrap text-ink-600">{JSON.stringify(r.changes, null, 1)}</pre></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
