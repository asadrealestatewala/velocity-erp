import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { endOfDay } from "date-fns";
import { Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, dealershipIds, leadScope, managedDealershipIds, requirePortalPage } from "@/server/authz";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader, StageBadge } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { StageSelect } from "@/components/leads/lead-dialogs";
import { TeamAssignSelect } from "@/components/leads/team-assign-select";
import { cn, fmtDate, fmtDateTime, fmtRelative, fullName } from "@/lib/utils";
import { ORIGIN_LABEL } from "@/lib/constants";

export const metadata = { title: "Leads" };

export default async function PortalLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("contacts.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams);
  const lk = await lookups();
  const and: Prisma.LeadWhereInput[] = [leadScope(user), { isArchived: false }];
  if (p.view === "mine") and.push({ assignedUserId: user.id });
  if (p.origin === "COMPANY" || p.origin === "DEALERSHIP_WALK_IN") and.push({ origin: p.origin });
  if (p.stage) {
    const st = lk.stages.find((s) => s.id === p.stage || s.key === p.stage);
    if (st) and.push({ stageId: st.id });
  }
  if (p.rep === "none") and.push({ assignedUserId: null });
  else if (p.rep) and.push({ assignedUserId: p.rep });
  if (p.model) and.push({ interestedModelId: p.model });
  if (p.followUp === "due") and.push({ nextFollowUpAt: { lte: endOfDay(new Date()) }, stage: { kind: "OPEN" } });
  if (p.q) and.push({ contact: { OR: [{ firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { phone: { contains: p.q } }, { email: { contains: p.q, mode: "insensitive" } }] } });
  const where = { AND: and };
  const managed = managedDealershipIds(user);
  const [rows, total, members] = await Promise.all([
    db.lead.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take: pageSize,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } }, stage: true, interestedModel: { select: { name: true } },
        assignedUser: { select: { id: true, name: true } },
        testDrives: { where: { status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED"] } }, orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true, status: true } },
      },
    }),
    db.lead.count({ where }),
    db.dealershipMembership.findMany({ where: { dealershipId: { in: dealershipIds(user) }, isActive: true, user: { isActive: true } }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const title = p.view === "mine" ? "My leads" : p.origin === "COMPANY" ? "Company-assigned leads" : p.origin === "DEALERSHIP_WALK_IN" ? "Walk-in leads" : "All dealership leads";
  const membersByDealer = (dId: string) => members.filter((m) => m.dealershipId === dId).map((m) => m.user);

  return (
    <>
      <PageHeader
        title={title}
        description={p.origin === "COMPANY" ? "Assigned to you by YADEA from central marketing, website forms and social channels." : p.origin === "DEALERSHIP_WALK_IN" ? "Created by your team for customers who visited or contacted your dealership directly." : `${total} lead(s)`}
        actions={can(user, "contacts.create") ? <ButtonLink href="/portal/leads/new"><Plus className="h-4 w-4" /> New walk-in lead</ButtonLink> : undefined}
      />
      <FilterBar
        keep={["view", "origin"]}
        filters={[
          { type: "search", name: "q", label: "Search", placeholder: "Name, phone, email…" },
          { type: "select", name: "origin", label: "Any origin", options: [{ value: "COMPANY", label: "Company-assigned" }, { value: "DEALERSHIP_WALK_IN", label: "Walk-in" }] },
          { type: "select", name: "stage", label: "Any stage", options: opt(lk.stages) },
          { type: "select", name: "rep", label: "Any rep", options: [{ value: "none", label: "Unassigned" }, ...members.map((m) => ({ value: m.user.id, label: m.user.name }))] },
          { type: "select", name: "model", label: "Any model", options: opt(lk.models) },
          { type: "select", name: "followUp", label: "Follow-up", options: [{ value: "due", label: "Due / overdue" }] },
        ]}
      />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title="No leads here yet" description="Company-assigned leads appear automatically; walk-ins are created by your team." action={can(user, "contacts.create") ? <ButtonLink href="/portal/leads/new">Add a walk-in lead</ButtonLink> : undefined} /></div>
      ) : (
        <TableWrap footer={<Pagination base="/portal/leads" params={p} page={page} pageSize={pageSize} total={total} />}>
          <thead className="bg-ink-50/60">
            <tr>
              <th className="th">Customer</th><th className="th">Phone</th><th className="th">Email</th><th className="th">Bike model</th><th className="th">Created</th><th className="th">Origin</th>
              <th className="th">Stage</th><th className="th">Salesperson</th><th className="th">Last activity</th><th className="th">Next follow-up</th><th className="th">Test drive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map((l) => {
              const overdue = l.nextFollowUpAt && l.nextFollowUpAt < new Date() && l.stage.kind === "OPEN";
              return (
                <tr key={l.id} className="hover:bg-ink-50/50">
                  <td className="td"><Link href={`/portal/contacts/${l.contact.id}?lead=${l.id}`} className="link">{fullName(l.contact)}</Link><p className="text-xs text-ink-400">#{l.number}</p></td>
                  <td className="td whitespace-nowrap">{l.contact.phone ? <a href={`tel:${l.contact.phone.replace(/\s/g, "")}`} className="hover:underline">{l.contact.phone}</a> : "—"}</td>
                  <td className="td max-w-[160px] truncate">{l.contact.email ?? "—"}</td>
                  <td className="td">{l.interestedModel?.name ?? "—"}</td>
                  <td className="td text-xs whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                  <td className="td"><Badge tone={l.origin === "COMPANY" ? "blue" : "brand"}>{ORIGIN_LABEL[l.origin]}</Badge></td>
                  <td className="td">{can(user, "leads.change_stage") ? <StageSelect compact leadId={l.id} currentStageId={l.stageId} stages={lk.stages} lossReasons={lk.lossReasons} models={lk.models} /> : <StageBadge name={l.stage.name} color={l.stage.color} />}</td>
                  <td className="td">
                    {l.dealershipId && managed.includes(l.dealershipId) && can(user, "leads.assign_team") ? (
                      <TeamAssignSelect leadId={l.id} dealershipId={l.dealershipId} current={l.assignedUser?.id ?? null} members={membersByDealer(l.dealershipId)} />
                    ) : (l.assignedUser?.name ?? <span className="text-ink-400">Unassigned</span>)}
                  </td>
                  <td className="td text-xs whitespace-nowrap">{fmtRelative(l.lastActivityAt)}</td>
                  <td className={cn("td text-xs whitespace-nowrap", overdue && "font-semibold text-red-600")}>{l.nextFollowUpAt ? `${overdue ? "Overdue · " : ""}${fmtDateTime(l.nextFollowUpAt)}` : "—"}</td>
                  <td className="td text-xs whitespace-nowrap">{l.testDrives[0] ? `${fmtDateTime(l.testDrives[0].scheduledAt)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
