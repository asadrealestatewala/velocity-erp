import { PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage("audit.view");
  const { q } = await searchParams;
  const rows = await platformDb().platformAudit.findMany({
    where: q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { adminEmail: { contains: q, mode: "insensitive" } }, { targetId: { contains: q } }] } : {},
    orderBy: { at: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Audit log" description="Every platform action, who did it and why. Entries cannot be edited or deleted from the console." />
      <form className="mb-4" action="/platform/audit"><input name="q" defaultValue={q} placeholder="Search action, person or id" className="input max-w-xs" /></form>
      <TableWrap>
        <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Target</th><th className="px-4 py-2.5">Reason / detail</th></tr></thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(r.at)}</td>
              <td className="px-4 py-2">{r.adminEmail ?? "system"}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
              <td className="px-4 py-2 text-xs">{r.targetType ? `${r.targetType} ${r.targetId ?? ""}` : "—"}</td>
              <td className="px-4 py-2 text-xs text-ink-600">{r.reason ?? ""}{r.detail && Object.keys(r.detail as object).length ? <code className="ml-1 break-all text-ink-500">{JSON.stringify(r.detail)}</code> : null}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">Nothing logged yet.</td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
