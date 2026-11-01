import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { accessibleContact } from "@/server/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { JobCardForm } from "@/components/service/service-forms";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { fullName, sp } from "@/lib/utils";

export const metadata = { title: "Open job card" };

export default async function NewJobCardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
        title="Open job card"
        description="Record a vehicle coming into the workshop. For a customer with a booking, check the booking in instead."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Service", href: "/portal/service" }, { label: "New job card" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <JobCardForm dealershipId={dealershipId} technicians={technicians} initialCustomer={customer} />
    </>
  );
}
