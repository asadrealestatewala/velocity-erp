import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { accessibleContact } from "@/server/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { BookingForm } from "@/components/service/service-forms";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { fullName, sp } from "@/lib/utils";

export const metadata = { title: "Book a service" };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("service.manage");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const technicians = (await db.dealershipMembership.findMany({ where: { dealershipId, isActive: true, user: { isActive: true } }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } })).map((m) => m.user);
  let customer: { id: string; name: string; phone: string | null } | undefined;
  try {
    const c = sp(params.contact) ? await accessibleContact(user, sp(params.contact)!) : null;
    if (c) customer = { id: c.id, name: fullName(c), phone: c.phone };
  } catch { customer = undefined; }
  return (
    <>
      <PageHeader
        title="Book a service"
        description="Schedule a workshop appointment. When the customer arrives, check the booking in to open its job card."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service", href: "/portal/service" }, { label: "Bookings", href: "/portal/service/bookings" }, { label: "New" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <BookingForm dealershipId={dealershipId} technicians={technicians} initialCustomer={customer} />
    </>
  );
}
