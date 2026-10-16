import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { addDays, addMonths, endOfDay, endOfMonth, endOfWeek, format, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Bike, CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, isCentral, testDriveScope } from "@/server/authz";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination, TableWrap, withParams } from "@/components/ui/table";
import { cn, fmtDateTime, fmtTime, fullName, isoDay } from "@/lib/utils";
import { TEST_DRIVE_STATUS } from "@/lib/constants";
import { TestDriveStatusControl } from "./status-control";
import { TestDriveRepSelect } from "./rep-select";

export async function TestDrivesView({ user, base, params }: { user: CurrentUser; base: string; params: Record<string, string | undefined> }) {
  const view = params.view === "calendar" ? "calendar" : "list";
  const central = isCentral(user);
  const and: Prisma.TestDriveBookingWhereInput[] = [testDriveScope(user)];
  if (params.status === "upcoming") and.push({ status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] }, scheduledAt: { gte: startOfDay(new Date()) } });
  else if (params.status === "awaiting") and.push({ status: { in: ["REQUESTED", "RESCHEDULED"] } });
  else if (params.status) and.push({ status: params.status as "REQUESTED" });
  if (params.dealership) and.push({ dealershipId: params.dealership });
  if (params.city) and.push({ cityId: params.city });
  if (params.model) and.push({ bikeModelId: params.model });
  if (params.focus) and.push({ id: params.focus });
  if (view === "list") {
    if (params.from) and.push({ scheduledAt: { gte: startOfDay(new Date(params.from)) } });
    if (params.to) and.push({ scheduledAt: { lte: endOfDay(new Date(params.to)) } });
  }
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? new Date(`${params.month}-01T00:00:00`) : startOfMonth(new Date());
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  if (view === "calendar") and.push({ scheduledAt: { gte: gridStart, lte: gridEnd } });
  const where = { AND: and };

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Number(params.pageSize) || 25);
  const include = {
    contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
    dealership: { select: { id: true, name: true } }, city: { select: { name: true } }, bikeModel: { select: { name: true } },
    assignedUser: { select: { id: true, name: true } },
  } satisfies Prisma.TestDriveBookingInclude;
  const [lk, rows, total, awaiting] = await Promise.all([
    lookups(),
    db.testDriveBooking.findMany({
      where,
      orderBy: { scheduledAt: view === "calendar" || params.status === "upcoming" ? "asc" : "desc" },
      skip: view === "list" ? (page - 1) * pageSize : 0,
      take: view === "list" ? pageSize : 1000,
      include,
    }),
    db.testDriveBooking.count({ where }),
    db.testDriveBooking.count({ where: { AND: [testDriveScope(user), { status: { in: ["REQUESTED", "RESCHEDULED"] } }] } }),
  ]);
  const canManage = can(user, "testdrives.manage");
  const listBase = `${base}/test-drives`;

  return (
    <>
      <PageHeader
        title="Test drives"
        description={awaiting ? `${awaiting} booking(s) awaiting confirmation — requests are not confirmed until an outlet confirms them` : "All bookings are confirmed or closed"}
        actions={
          <div className="flex rounded-lg border border-ink-200 bg-white p-0.5" role="group" aria-label="View">
            <Link href={withParams(listBase, params, { view: undefined, month: undefined })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "list" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}><List className="h-4 w-4" /> List</Link>
            <Link href={withParams(listBase, params, { view: "calendar", page: undefined })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "calendar" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}><CalendarDays className="h-4 w-4" /> Calendar</Link>
          </div>
        }
      />
      <FilterBar
        keep={["view", "month"]}
        filters={[
          { type: "select", name: "status", label: "Any status", options: [{ value: "upcoming", label: "Upcoming" }, { value: "awaiting", label: "Awaiting confirmation" }, ...Object.entries(TEST_DRIVE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))] },
          ...(central ? [{ type: "select" as const, name: "dealership", label: "Any outlet", options: opt(lk.dealerships) }, { type: "select" as const, name: "city", label: "Any city", options: opt(lk.cities) }] : []),
          { type: "select", name: "model", label: "Any model", options: opt(lk.models) },
          ...(view === "list" ? [{ type: "daterange" as const, from: "from", to: "to", label: "Scheduled" }] : []),
        ]}
      />
      {params.focus && <p className="mb-3 text-sm text-ink-600">Showing one booking. <Link href={listBase} className="link text-brand-600">Show all</Link></p>}

      {view === "calendar" ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <Link href={withParams(listBase, params, { month: format(addMonths(month, -1), "yyyy-MM") })} className="rounded-lg p-1.5 hover:bg-ink-100" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Link>
            <h2 className="font-semibold">{format(month, "MMMM yyyy")}</h2>
            <Link href={withParams(listBase, params, { month: format(addMonths(month, 1), "yyyy-MM") })} className="rounded-lg p-1.5 hover:bg-ink-100" aria-label="Next month"><ChevronRight className="h-5 w-5" /></Link>
          </div>
          <div className="scrollbar-thin overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-b border-ink-100 px-2 py-2 text-xs font-semibold text-ink-500 uppercase">{d}</div>)}
              {Array.from({ length: Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400_000) }, (_, i) => addDays(gridStart, i)).map((day) => {
                const key = isoDay(day);
                const items = rows.filter((r) => isoDay(r.scheduledAt) === key);
                const today = key === isoDay(new Date());
                return (
                  <div key={key} className={cn("min-h-[112px] border-r border-b border-ink-100 p-1.5", !isSameMonth(day, month) && "bg-ink-50/60")}>
                    <p className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", today ? "bg-brand-500 text-white" : "text-ink-500")}>{format(day, "d")}</p>
                    <div className="space-y-1">
                      {items.slice(0, 4).map((t) => (
                        <Link key={t.id} href={`${base}/contacts/${t.contact.id}`} className={cn("block truncate rounded-md px-1.5 py-1 text-[11px] font-medium ring-1 ring-inset", {
                          "bg-amber-50 text-amber-800 ring-amber-200": t.status === "REQUESTED" || t.status === "RESCHEDULED",
                          "bg-blue-50 text-blue-800 ring-blue-200": t.status === "CONFIRMED",
                          "bg-emerald-50 text-emerald-800 ring-emerald-200": t.status === "COMPLETED",
                          "bg-ink-100 text-ink-500 line-through ring-ink-200": t.status === "CANCELLED" || t.status === "NO_SHOW",
                        })} title={`${fmtTime(t.scheduledAt)} ${fullName(t.contact)} · ${t.bikeModel.name} · ${t.dealership.name} · ${TEST_DRIVE_STATUS[t.status]!.label}`}>
                          {fmtTime(t.scheduledAt)} {fullName(t.contact)}
                        </Link>
                      ))}
                      {items.length > 4 && <p className="px-1 text-[11px] text-ink-400">+{items.length - 4} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-ink-100 px-4 py-2.5 text-xs text-ink-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-200" />Awaiting confirmation</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-200" />Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-200" />Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-ink-200" />Cancelled / no-show</span>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card"><EmptyState icon={Bike} title="No test drives match" description="Bookings from the public form and from contact profiles appear here." /></div>
      ) : (
        <TableWrap footer={<Pagination base={listBase} params={params} page={page} pageSize={pageSize} total={total} />}>
          <thead className="bg-ink-50/60">
            <tr>
              <th className="th">Booking</th><th className="th">Customer</th><th className="th">Outlet · City</th><th className="th">Model</th>
              <th className="th">Preferred date & time</th><th className="th">Representative</th><th className="th">Status</th><th className="th">Notes</th><th className="th">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map((t) => (
              <tr key={t.id} className="align-top hover:bg-ink-50/50">
                <td className="td font-medium whitespace-nowrap">#{t.number}<p className="text-xs font-normal text-ink-400">{t.confirmedAt ? "Confirmed" : "Unconfirmed"}</p></td>
                <td className="td">
                  <Link href={`${base}/contacts/${t.contact.id}`} className="link">{fullName(t.contact)}</Link>
                  <p className="text-xs text-ink-500">{t.contact.phone}</p>
                  {t.contact.email && <p className="max-w-[180px] truncate text-xs text-ink-400">{t.contact.email}</p>}
                </td>
                <td className="td">{t.dealership.name}<p className="text-xs text-ink-400">{t.city.name}</p></td>
                <td className="td">{t.bikeModel.name}</td>
                <td className="td whitespace-nowrap">{fmtDateTime(t.scheduledAt)}</td>
                <td className="td">{canManage ? <TestDriveRepSelect bookingId={t.id} dealershipId={t.dealership.id} current={t.assignedUser} /> : (t.assignedUser?.name ?? "—")}</td>
                <td className="td"><TestDriveStatusControl bookingId={t.id} status={t.status} canManage={canManage} /></td>
                <td className="td max-w-[220px] text-xs">
                  {t.customerNotes && <p className="text-ink-600"><b className="text-ink-500">Customer:</b> {t.customerNotes}</p>}
                  {t.internalNotes && <p className="text-ink-600"><b className="text-ink-500">Internal:</b> {t.internalNotes}</p>}
                  {t.feedback && <p className="text-emerald-700"><b>Feedback:</b> {t.feedback}</p>}
                  {!t.customerNotes && !t.internalNotes && !t.feedback && <span className="text-ink-300">—</span>}
                </td>
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {view === "list" && <p className="mt-3 text-xs text-ink-400"><Badge tone="amber">Requested</Badge> bookings are customer requests — an outlet must confirm before the slot is treated as booked.</p>}
    </>
  );
}
