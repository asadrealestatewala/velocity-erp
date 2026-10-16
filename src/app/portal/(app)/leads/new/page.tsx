import { db } from "@/lib/db";
import { dealershipIds, requirePortalPage } from "@/server/authz";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { ContactForm } from "@/components/contacts/contact-form";

export const metadata = { title: "New walk-in lead" };

export default async function NewWalkInPage() {
  const user = await requirePortalPage("contacts.create");
  const isManager = user.memberships.some((m) => m.role === "MANAGER");
  const [lk, customFields, reps] = await Promise.all([
    lookups(),
    db.customFieldDefinition.findMany({ where: { entity: "CONTACT", isActive: true }, orderBy: { sortOrder: "asc" } }),
    isManager
      ? db.user.findMany({ where: { isActive: true, memberships: { some: { dealershipId: { in: dealershipIds(user) }, isActive: true } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve(undefined),
  ]);
  return (
    <>
      <PageHeader title="New walk-in lead" description="For customers who visit or contact your dealership directly. The lead stays with your dealership." breadcrumbs={[{ label: "Leads", href: "/portal/leads" }, { label: "New walk-in" }]} />
      <ContactForm mode="walkin" base="/portal" lookups={lk} customFields={customFields} reps={reps} dealershipId={user.memberships[0]!.dealershipId} />
    </>
  );
}