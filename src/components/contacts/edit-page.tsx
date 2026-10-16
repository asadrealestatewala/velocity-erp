import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { contactScope, isCentral } from "@/server/authz";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { fullName } from "@/lib/utils";
import { ContactForm } from "./contact-form";

/** Shared edit page for the CRM and the portal — the scope check runs on the server. */
export async function ContactEditPage({ user, id, base }: { user: CurrentUser; id: string; base: string }) {
  const c = await db.contact.findFirst({ where: { AND: [{ id }, contactScope(user)] } });
  if (!c) notFound();
  const [lk, customFields, owners] = await Promise.all([
    lookups(),
    db.customFieldDefinition.findMany({ where: { entity: "CONTACT", isActive: true }, orderBy: { sortOrder: "asc" } }),
    isCentral(user) ? db.user.findMany({ where: { isActive: true, role: { scope: "CENTRAL" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve(undefined),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${fullName(c)}`}
        breadcrumbs={[{ label: "Contacts", href: `${base}/contacts` }, { label: fullName(c), href: `${base}/contacts/${c.id}` }, { label: "Edit" }]}
      />
      <ContactForm
        mode="edit"
        base={base}
        contactId={c.id}
        lookups={lk}
        customFields={customFields}
        owners={owners}
        initial={{
          type: c.type, salutation: c.salutation ?? "", firstName: c.firstName, lastName: c.lastName ?? "",
          dateOfBirth: (c.dateOfBirth ? format(c.dateOfBirth, "yyyy-MM-dd") : "") as unknown as Date,
          gender: c.gender ?? "", profession: c.profession ?? "", phone: c.phone ?? "", alternatePhone: c.alternatePhone ?? "",
          email: c.email ?? "", businessName: c.businessName ?? "", website: c.website ?? "", address: c.address ?? "",
          cityId: c.cityId ?? "", provinceId: c.provinceId ?? "", postalCode: c.postalCode ?? "", country: c.country ?? "",
          sourceId: c.sourceId ?? "", ownerId: c.ownerId ?? "", consentMarketing: c.consentMarketing,
          preferredContactMethod: c.preferredContactMethod ?? "",
          communicationPrefs: (c.communicationPrefs ?? {}) as Record<string, boolean>,
          customFields: (c.customFields ?? {}) as Record<string, string>,
        }}
      />
    </>
  );
}
