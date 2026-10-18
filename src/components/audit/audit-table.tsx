import { History } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Pagination, TableWrap } from "@/components/ui/table";
import { auditLabel, describeChanges } from "@/lib/audit-labels";
import { fmtDateTime } from "@/lib/utils";

export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: unknown;
  ipAddress?: string | null;
  actor: string;
  /** Central (YADEA head-office) actor. */
  actorIsCentral: boolean;
  dealership?: string | null;
};

/** One audit table for both views. Dealerships see readable summaries only: no IP addresses, no raw JSON. */
export function AuditTable({
  rows, total, page, pageSize, base, params, variant,
}: { rows: AuditRow[]; total: number; page: number; pageSize: number; base: string; params: Record<string, string | undefined>; variant: "dealer" | "central" }) {
  return (
    <>
      <TableWrap footer={<Pagination base={base} params={params} page={page} pageSize={pageSize} total={total} sizes={[50, 100]} />}>
        <thead className="bg-ink-50/60">
          <tr>
            <th className="th">When</th><th className="th">Who</th>{variant === "central" && <th className="th">Dealership</th>}<th className="th">What happened</th><th className="th">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((r) => {
            const details = describeChanges(r.changes);
            return (
              <tr key={r.id} className="align-top hover:bg-ink-50/40">
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                <td className="td">{r.actor}{variant === "dealer" && r.actorIsCentral && <Badge tone="blue" className="ml-1.5">YADEA</Badge>}</td>
                {variant === "central" && <td className="td text-xs">{r.dealership ?? <span className="text-ink-400">—</span>}</td>}
                <td className="td">
                  <p className="font-medium text-ink-900">{auditLabel(r.action)}</p>
                  {variant === "central" && <p className="font-mono text-[11px] text-ink-400">{r.action}{r.ipAddress ? ` · ${r.ipAddress}` : ""}</p>}
                  {variant === "dealer" && <p className="text-xs text-ink-400">{r.entityType}</p>}
                </td>
                <td className="td max-w-md">
                  {details.length === 0 ? <span className="text-ink-300">—</span> : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                      {details.slice(0, 8).map((d) => (<div key={d.key} className="contents"><dt className="text-ink-400">{d.key}</dt><dd className="break-words text-ink-700">{d.value}</dd></div>))}
                    </dl>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={History} title="No matching activity" description="Try widening the filters." /></div>}
    </>
  );
}
