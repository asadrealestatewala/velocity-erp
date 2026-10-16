import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Store } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { TableWrap, parseListParams } from "@/components/ui/table";
import { humanize } from "@/lib/utils";
import { DEALERSHIP_STATUS } from "@/lib/constants";

export const metadata = { title: "Dealerships" };

export default async function DealershipsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("dealerships.view");
  const { flat: p } = parseListParams(await searchParams);
  const where: Prisma.DealershipWhereInput = {
    ...(p.status ? { status: p.status as "ACTIVE" } : {}),
    ...(p.city ? { cityId: p.city } : {}),
    ...(p.type ? { type: p.type as "OUTLET" } : {}),
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { code: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, lk] = await Promise.all([
    db.dealership.findMany({
      where,
      orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
      include: {
        city: { select: { name: true } }, parent: { select: { name: true } },
        memberships: { where: { isActive: true }, select: { role: true, user: { select: { name: true } } } },
        _count: { select: { leads: { where: { stage: { kind: "OPEN" }, isArchived: false } }, bikeModels: true } },
      },
    }),
    lookups(),
  ]);
  return (
    <>
      <PageHeader
        title="Dealerships & outlets"
        description={`${rows.filter((r) => r.status === "ACTIVE").length} active · ${rows.filter((r) => r.acceptsLeads).length} receiving leads`}
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Dealerships" }]}
        actions={can(user, "dealerships.manage") ? <ButtonLink href="/crm/dealerships/new"><Plus className="h-4 w-4" /> New dealership</ButtonLink> : undefined}
      />
      <FilterBar
        filters={[
          { type: "search", name: "q", label: "Search", placeholder: "Name or code…" },
          { type: "select", name: "status", label: "Any status", options: Object.entries(DEALERSHIP_STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
          { type: "select", name: "city", label: "Any city", options: opt(lk.cities) },
          { type: "select", name: "type", label: "Any type", options: ["DEALERSHIP", "OUTLET", "FRANCHISE", "SUB_DEALER"].map((t) => ({ value: t, label: humanize(t) })) },
        ]}
      />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Store} title="No dealerships" description="Create a dealership, or approve an application and convert it." /></div>
      ) : (
        <TableWrap>
          <thead className="bg-ink-50/60">
            <tr>
              <th className="th">Dealership</th><th className="th">Code</th><th className="th">Type</th><th className="th">City</th><th className="th">Status</th>
              <th className="th">Lead assignment</th><th className="th">Manager</th><th className="th text-right">Team</th><th className="th text-right">Models</th><th className="th text-right">Open leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/crm/dealerships/${d.id}`} className="link">{d.name}</Link>{d.parent && <p className="text-xs text-ink-400">under {d.parent.name}</p>}</td>
                <td className="td font-mono text-xs">{d.code}</td>
                <td className="td">{humanize(d.type)}</td>
                <td className="td">{d.city.name}</td>
                <td className="td"><Badge tone={DEALERSHIP_STATUS[d.status]!.tone}>{DEALERSHIP_STATUS[d.status]!.label}</Badge></td>
                <td className="td">{d.acceptsLeads ? <Badge tone="green" dot="#16a34a">Receiving</Badge> : <Badge tone="gray">Off</Badge>}</td>
                <td className="td">{d.memberships.filter((m) => m.role === "MANAGER").map((m) => m.user.name).join(", ") || <span className="text-amber-700">None</span>}</td>
                <td className="td text-right tabular-nums">{d.memberships.length}</td>
                <td className="td text-right tabular-nums">{d._count.bikeModels}</td>
                <td className="td text-right tabular-nums">{d._count.leads}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
