import { db } from "@/lib/db";
import { dealershipIds, requirePortalPage } from "@/server/authz";
import { listContacts, type ContactFilters as F } from "@/server/queries/contacts";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { parseListParams } from "@/components/ui/table";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { ContactFilters } from "@/components/contacts/contact-filters";

export const metadata = { title: "Contacts" };

export default async function PortalContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("contacts.view");
  const { flat, page, pageSize } = parseListParams(await searchParams);
  const [{ rows, total }, lk, reps] = await Promise.all([
    listContacts(user, flat as F, page, pageSize),
    lookups(),
    db.user.findMany({ where: { isActive: true, memberships: { some: { dealershipId: { in: dealershipIds(user) } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Contacts" description={`${total} customer(s) with leads at your dealership`} />
      <ContactFilters lk={lk} reps={reps} central={false} />
      <ContactsTable user={user} rows={rows} total={total} page={page} pageSize={pageSize} base="/portal" params={flat} />
    </>
  );
}