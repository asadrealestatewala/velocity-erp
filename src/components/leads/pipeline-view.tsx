import Link from "next/link";
import { KanbanSquare, List } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, isCentral } from "@/server/authz";
import { getBoard, pipelineWhere, type PipelineFilters } from "@/server/queries/pipeline";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { PageHeader, StageBadge } from "@/components/ui/misc";
import { Pagination, TableWrap, withParams } from "@/components/ui/table";
import { cn, fmtDateTime, fmtRelative, fullName } from "@/lib/utils";
import { ORIGIN_LABEL } from "@/lib/constants";
import { PipelineBoard } from "./pipeline-board";
import { StageSelect } from "./lead-dialogs";

export async function PipelineView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const view = params.view === "table" ? "table" : "board";
  const f = params as PipelineFilters;
  const central = isCentral(user);
  const [lk, owners] = await Promise.all([
    lookups(),
    central
      ? db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : db.user.findMany({ where: { isActive: true, memberships: { some: { dealershipId: { in: user.memberships.map((m) => m.dealershipId) } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const canMove = can(user, "leads.change_stage");

  return (
    <>
      <PageHeader
        title="Leads pipeline"
        description="Drag cards between stages. Every move is recorded in the lead's stage history."
        breadcrumbs={[{ label: central ? "CRM" : "Portal", href: `${base}/dashboard` }, { label: "Pipeline" }]}
        actions={
          <div className="flex rounded-lg border border-ink-200 bg-white p-0.5" role="group" aria-label="View">
            <Link href={withParams(`${base}/pipeline`, params, { view: undefined })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "board" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>
              <KanbanSquare className="h-4 w-4" /> Board
            </Link>
            <Link href={withParams(`${base}/pipeline`, params, { view: "table" })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "table" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>
              <List className="h-4 w-4" /> Table
            </Link>
          </div>
        }
      />
      <FilterBar
        keep={["view"]}
        filters={[
          { type: "search", name: "q", label: "Search", placeholder: "Search name or phone…" },
          { type: "select", name: "source", label: "Any source", options: opt(lk.sources) },
          { type: "select", name: "city", label: "Any city", options: opt(lk.cities) },
          ...(central ? [{ type: "select" as const, name: "dealership", label: "Any dealership", options: [{ value: "none", label: "— Unassigned —" }, ...opt(lk.dealerships)] }] : []),
          { type: "select", name: "owner", label: "Any owner / rep", options: opt(owners) },
          { type: "select", name: "origin", label: "Any origin", options: [{ value: "COMPANY", label: "Company-assigned" }, { value: "DEALERSHIP_WALK_IN", label: "Walk-in" }] },
          { type: "daterange", from: "from", to: "to", label: "Created" },
        ]}
      />
      {view === "board" ? (
        <PipelineBoard columns={await getBoard(user, f)} base={base} canMove={canMove} lossReasons={lk.lossReasons} models={lk.models} />
      ) : (
        <PipelineTable user={user} base={base} params={params} lk={lk} canMove={canMove} />
      )}
    </>
  );
}

async function PipelineTable({ user, base, params, lk, canMove }: { user: CurrentUser; base: string; params: Record<string, string | undefined>; lk: Awaited<ReturnType<typeof lookups>>; canMove: boolean }) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Number(params.pageSize) || 25);
  const where = pipelineWhere(user, params as PipelineFilters);
  const [rows, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ stage: { sortOrder: "asc" } }, { stageChangedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } }, stage: true, dealership: { select: { name: true } },
        assignedUser: { select: { name: true } }, source: { select: { name: true } }, city: { select: { name: true } }, interestedModel: { select: { name: true } },
      },
    }),
    db.lead.count({ where }),
  ]);
  return (
    <TableWrap footer={<Pagination base={`${base}/pipeline`} params={params} page={page} pageSize={pageSize} total={total} />}>
      <thead className="bg-ink-50/60">
        <tr>
          <th className="th">Lead</th><th className="th">Stage</th><th className="th">Source</th><th className="th">City</th>
          <th className="th">Dealership</th><th className="th">Rep</th><th className="th">Model</th><th className="th">In stage since</th><th className="th">Created</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-100 bg-white">
        {rows.map((l) => (
          <tr key={l.id} className="hover:bg-ink-50/50">
            <td className="td">
              <Link href={`${base}/contacts/${l.contact.id}?lead=${l.id}`} className="link">{fullName(l.contact)}</Link>
              <p className="text-xs text-ink-400">#{l.number} · {ORIGIN_LABEL[l.origin]}</p>
            </td>
            <td className="td">
              {canMove ? <StageSelect compact leadId={l.id} currentStageId={l.stageId} stages={lk.stages} lossReasons={lk.lossReasons} models={lk.models} /> : <StageBadge name={l.stage.name} color={l.stage.color} />}
            </td>
            <td className="td">{l.source?.name ?? "—"}</td>
            <td className="td">{l.city?.name ?? "—"}</td>
            <td className="td">{l.dealership?.name ?? <span className="text-red-600">Unassigned</span>}</td>
            <td className="td">{l.assignedUser?.name ?? "—"}</td>
            <td className="td">{l.interestedModel?.name ?? "—"}</td>
            <td className="td text-xs">{fmtRelative(l.stageChangedAt)}</td>
            <td className="td text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={9} className="td py-10 text-center text-ink-400">No leads match these filters.</td></tr>
        )}
      </tbody>
    </TableWrap>
  );
}
