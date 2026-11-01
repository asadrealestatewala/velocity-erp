import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import type { Prisma, ServiceBookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { BookingActions } from "@/components/service/booking-actions";
import { SERVICE_BOOKING_STATUS } from "@/lib/ops-constants";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Service bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("service.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams, { pageSize: 25 });
  const dealershipId = activeDealershipId(user, p.dealership)!;
  const canManage = can(user, "service.manage");
  const where: Prisma.ServiceBookingWhereInput = {
    dealershipId,
    ...(p.status && p.status in SERVICE_BOOKING_STATUS ? { status: p.status as ServiceBookingStatus } : {}),
    ...(p.q ? { OR: [{ customerName: { contains: p.q, mode: "insensitive" } }, { plateNumber: { contains: p.q, mode: "insensitive" } }, { customerPhone: { contains: p.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.serviceBooking.findMany({ where, orderBy: { scheduledAt: "desc" }, skip, take: pageSize, include: { assignedUser: { select: { name: true } }, jobCard: { select: { id: true, number: true } } } }),
    db.serviceBooking.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Service bookings"
        description="Workshop appointments. Check a customer in when they arrive to open their job card."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service", href: "/portal/service" }, { label: "Bookings" }]}
        actions={
          <>
            <DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />
            {canManage && <ButtonLink href="/portal/service/bookings/new"><Plus className="h-4 w-4" /> Book service</ButtonLink>}
          </>
        }
      />
      <FilterBar filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Customer, phone or plate" },
        { type: "select", name: "status", label: "Any status", options: Object.entries(SERVICE_BOOKING_STATUS).map(([value, m]) => ({ value, label: m.label })) },
      ]} keep={["dealership"]} />
      <TableWrap footer={<Pagination base="/portal/service/bookings" params={p} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60"><tr><th className="th">Booking</th><th className="th">Customer</th><th className="th">Vehicle</th><th className="th">Service</th><th className="th">When</th><th className="th">Status</th><th className="th text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((b) => {
            const st = SERVICE_BOOKING_STATUS[b.status]!;
            return (
              <tr key={b.id}>
                <td className="td font-mono text-[13px]">SB-{b.number}</td>
                <td className="td">{b.customerName}{b.customerPhone && <span className="block text-xs text-ink-500">{b.customerPhone}</span>}</td>
                <td className="td text-sm">{[b.vehicleLabel, b.plateNumber].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td text-sm">{b.serviceType}{b.assignedUser && <span className="block text-xs text-ink-500">{b.assignedUser.name}</span>}</td>
                <td className="td whitespace-nowrap text-xs">{fmtDateTime(b.scheduledAt)}</td>
                <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                <td className="td">
                  {b.jobCard ? <div className="text-right"><Link className="link text-xs" href={`/portal/service/${b.jobCard.id}`}>JC-{b.jobCard.number}</Link></div> : canManage ? <BookingActions id={b.id} status={b.status} dealershipId={dealershipId} complaint={b.notes} /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {rows.length === 0 && (
        <div className="card -mt-px rounded-t-none border-t-0">
          <EmptyState icon={CalendarClock} title="No bookings yet" description={canManage ? "Book a service appointment for a customer." : "Bookings made by your team will appear here."} action={canManage ? <ButtonLink href="/portal/service/bookings/new">Book service</ButtonLink> : undefined} />
        </div>
      )}
    </>
  );
}
