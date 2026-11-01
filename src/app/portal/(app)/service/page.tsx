import Link from "next/link";
import { CalendarClock, ClipboardList, Plus, Wrench } from "lucide-react";
import type { JobCardStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { JOB_CARD_STATUS } from "@/lib/ops-constants";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { startOfDay, endOfDay } from "date-fns";

export const metadata = { title: "Workshop job cards" };

export default async function JobCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("service.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const canManage = can(user, "service.manage");
  const statuses = Object.keys(JOB_CARD_STATUS);

  const where: Prisma.JobCardWhereInput = {
    dealershipId,
    ...(p.status && statuses.includes(p.status) ? { status: p.status as JobCardStatus } : {}),
    ...(p.q
      ? { OR: [
          { customerName: { contains: p.q, mode: "insensitive" } },
          { plateNumber: { contains: p.q, mode: "insensitive" } },
          { chassisNo: { contains: p.q, mode: "insensitive" } },
          { customerPhone: { contains: p.q } },
          ...(Number(p.q.replace(/\D/g, "")) ? [{ number: Number(p.q.replace(/\D/g, "")) }] : []),
        ] }
      : {}),
  };
  const now = new Date();
  const [rows, total, open, awaiting, todays] = await Promise.all([
    db.jobCard.findMany({ where, orderBy: { openedAt: "desc" }, skip, take: pageSize, include: { technician: { select: { name: true } } } }),
    db.jobCard.count({ where }),
    db.jobCard.count({ where: { dealershipId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.jobCard.count({ where: { dealershipId, status: "AWAITING_PARTS" } }),
    db.serviceBooking.count({ where: { dealershipId, status: { in: ["REQUESTED", "CONFIRMED"] }, scheduledAt: { gte: startOfDay(now), lte: endOfDay(now) } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Workshop job cards"
        description="Vehicles in your workshop. Spare parts used on a job are deducted from your showroom stock."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            <ButtonLink href="/portal/service/bookings" variant="secondary"><CalendarClock className="h-4 w-4" /> Bookings</ButtonLink>
            {canManage && <ButtonLink href="/portal/service/new"><Plus className="h-4 w-4" /> Open job card</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Jobs in the workshop" value={open} icon={Wrench} tone="blue" />
        <StatCard label="Waiting for parts" value={awaiting} icon={ClipboardList} tone="amber" />
        <StatCard label="Bookings due today" value={todays} icon={CalendarClock} tone="green" />
      </div>
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Customer, plate, chassis or JC no." },
        { type: "select", name: "status", label: "Any status", options: Object.entries(JOB_CARD_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/service" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Job</th><th className="th">Customer</th><th className="th">Vehicle</th><th className="th">Status</th><th className="th text-right">Total</th><th className="th">Opened</th><th className="th">Technician</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((j) => {
            const st = JOB_CARD_STATUS[j.status]!;
            return (
              <tr key={j.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/portal/service/${j.id}`} className="link font-mono text-[13px]">JC-{j.number}</Link>{j.isWarranty && <Badge tone="violet" className="ml-2">Warranty</Badge>}</td>
                <td className="td">{j.customerName}</td>
                <td className="td text-sm">{[j.vehicleLabel, j.plateNumber].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(j.total.toString(), j.currency)}</td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(j.openedAt)}</td>
                <td className="td text-xs">{j.technician?.name ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={Wrench} title="No job cards yet" description={canManage ? "Open a job card when a vehicle comes into the workshop, or check in a booking." : "Job cards opened by your team will appear here."} action={canManage ? <ButtonLink href="/portal/service/new">Open job card</ButtonLink> : undefined} />
        </div>
      )}
    </>
  );
}
