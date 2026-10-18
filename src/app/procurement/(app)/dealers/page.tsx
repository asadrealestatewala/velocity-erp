import Link from "next/link";
import { Store } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requireProcurementPage } from "@/server/authz";
import { balancesByDealership } from "@/server/services/ledger";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { DEALERSHIP_STATUS } from "@/lib/constants";
import { fmtMoney } from "@/lib/utils";

export const metadata = { title: "Dealerships" };

export default async function DealersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage("dealerships.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const where: Prisma.DealershipWhereInput = {
    ...(p.status ? { status: p.status as Prisma.EnumDealershipStatusFilter["equals"] } : {}),
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { code: { contains: p.q, mode: "insensitive" } }, { city: { name: { contains: p.q, mode: "insensitive" } } }] } : {}),
  };
  const seeLedger = can(user, "ledger.view");
  const [rows, total, balances] = await Promise.all([
    db.dealership.findMany({
      where, orderBy: { name: "asc" }, skip, take: pageSize,
      include: {
        city: { select: { name: true } },
        _count: { select: { procurementOrders: { where: { status: { in: ["SUBMITTED", "APPROVED"] } } }, inventory: true, dealerDocuments: { where: { deletedAt: null } } } },
      },
    }),
    db.dealership.count({ where }),
    seeLedger ? balancesByDealership() : Promise.resolve(new Map()),
  ]);
  return (
    <>
      <PageHeader title="Dealerships" description="Open a dealership to see its stock, orders, ledger, vouchers and documents in one place." breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Dealerships" }]} />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Name, code or city" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(DEALERSHIP_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} />
      <TableWrap footer={<Pagination base="/procurement/dealers" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Dealership</th><th className="th">City</th><th className="th">Status</th><th className="th text-right">Open orders</th><th className="th text-right">Stock lines</th><th className="th text-right">Documents</th>{seeLedger && <><th className="th text-right">Balance owed</th><th className="th text-right">Awaiting verification</th></>}</tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((d) => {
            const b = balances.get(d.id);
            const st = DEALERSHIP_STATUS[d.status]!;
            return (
              <tr key={d.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/procurement/dealers/${d.id}`} className="link">{d.name}</Link><span className="ml-2 font-mono text-xs text-ink-400">{d.code}</span></td>
                <td className="td">{d.city.name}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td text-right tabular-nums">{d._count.procurementOrders}</td>
                <td className="td text-right tabular-nums">{d._count.inventory}</td>
                <td className="td text-right tabular-nums">{d._count.dealerDocuments}</td>
                {seeLedger && (
                  <>
                    <td className="td text-right font-medium tabular-nums">{b ? <span className={b.balance > 0 ? "text-red-700" : "text-emerald-700"}>{fmtMoney(b.balance)}</span> : "—"}</td>
                    <td className="td text-right tabular-nums">{b && b.pending > 0 ? <span className="text-amber-700">{fmtMoney(b.pending)}</span> : "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && <div className="card -mt-px rounded-t-none border-t-0"><EmptyState icon={Store} title="No dealerships found" /></div>}
    </>
  );
}
