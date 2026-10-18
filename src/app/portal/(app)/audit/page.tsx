import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filters/filter-bar";
import { parseListParams } from "@/components/ui/table";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { AuditTable } from "@/components/audit/audit-table";
import { auditLabel } from "@/lib/audit-labels";

export const metadata = { title: "Audit log" };

export default async function PortalAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("audit.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 50 });
  const dealershipId = activeDealershipId(user, p.dealership)!;

  // The dealership id is part of every query: a dealership can only ever read entries tagged with itself.
  const where: Prisma.AuditLogWhereInput = {
    dealershipId,
    ...(p.user === "__yadea" ? { user: { role: { scope: "CENTRAL" as const } } } : p.user ? { userId: p.user } : {}),
    ...(p.action ? { action: { startsWith: p.action } } : {}),
    ...(p.from || p.to ? { createdAt: { ...(p.from ? { gte: new Date(`${p.from}T00:00:00`) } : {}), ...(p.to ? { lte: new Date(`${p.to}T23:59:59`) } : {}) } } : {}),
  };
  const [rows, total, actions, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: { select: { name: true, role: { select: { scope: true } } } } } }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where: { dealershipId }, distinct: ["action"], select: { action: true } }),
    db.auditLog.findMany({ where: { dealershipId, userId: { not: null } }, distinct: ["userId"], select: { user: { select: { id: true, name: true, role: { select: { scope: true } } } } } }),
  ]);
  // Group actions by their area (the part before the dot) for a short filter list.
  const areas = [...new Set(actions.map((a) => a.action.split(".")[0]!))].sort();
  const areaLabel = (a: string) => ({ auth: "Sign-ins", lead: "Leads", inventory: "Inventory", salesorder: "Customer orders", procurement: "Stock orders", ledger: "Ledger & payments", voucher: "Expense vouchers", dealerdoc: "Documents", team: "Team", testdrive: "Test drives", contact: "Contacts", document: "Customer documents", payment: "Customer payments", dealership: "Dealership profile" } as Record<string, string>)[a] ?? auditLabel(`${a}.x`).replace(/ x$/, "");

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A record of sensitive activity in your dealership: sign-ins, stock changes, orders, payments, documents and team changes."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Audit log" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <FilterBar keep={["dealership"]} filters={[
        { type: "select", name: "action", label: "Any activity", options: areas.map((a) => ({ value: `${a}.`, label: areaLabel(a) })) },
        { type: "select", name: "user", label: "Anyone", options: [{ value: "__yadea", label: "YADEA team" }, ...users.filter((u) => u.user && u.user.role.scope !== "CENTRAL").map((u) => ({ value: u.user!.id, label: u.user!.name }))] },
        { type: "daterange", from: "from", to: "to", label: "When", presets: true },
      ]} />
      <AuditTable
        variant="dealer"
        base="/portal/audit"
        params={p}
        page={page}
        pageSize={pageSize}
        total={total}
        rows={rows.map((r) => ({
          id: r.id, createdAt: r.createdAt, action: r.action, entityType: r.entityType, entityId: r.entityId, changes: r.changes,
          // Dealerships see that YADEA acted, not which individual at head office.
          actor: r.user ? (r.user.role.scope === "CENTRAL" ? "YADEA team" : r.user.name) : "System",
          actorIsCentral: r.user?.role.scope === "CENTRAL",
        }))}
      />
    </>
  );
}
