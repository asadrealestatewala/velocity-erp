import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { ContactForm } from "@/components/contacts/contact-form";

export const metadata = { title: "New contact" };

export default async function NewContactPage() {
  await requireCentralPage("contacts.create");
  const [lk, customFields, owners] = await Promise.all([
    lookups(),
    db.customFieldDefinition.findMany({ where: { entity: "CONTACT", isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { isActive: true, role: { scope: "CENTRAL" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New contact" breadcrumbs={[{ label: "Contacts", href: "/crm/contacts" }, { label: "New" }]} />
      <ContactForm mode="create" base="/crm" lookups={lk} customFields={customFields} owners={owners} />
    </>
  );
}
