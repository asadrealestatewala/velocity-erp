import { Download, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { listContacts, type ContactFilters as F } from "@/server/queries/contacts";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { parseListParams } from "@/components/ui/table";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { ContactFilters } from "@/components/contacts/contact-filters";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("contacts.view");
  const { flat, page, pageSize } = parseListParams(await searchParams);
  const [{ rows, total }, lk, reps] = await Promise.all([
    listContacts(user, flat as F, page, pageSize),
    lookups(),
    db.user.findMany({ where: { isActive: true, role: { scope: "DEALERSHIP" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const exportQs = new URLSearchParams(Object.entries(flat).filter(([k, v]) => v && k !== "page" && k !== "pageSize") as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total} ${flat.archived === "yes" ? "archived" : "active"} contacts across all channels`}
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Contacts" }]}
        actions={
          <>
            {can(user, "contacts.export") && (
              <a href={`/api/export/contacts?${exportQs}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50">
                <Download className="h-4 w-4" /> Export CSV
              </a>
            )}
            {can(user, "contacts.create") && (
              <ButtonLink href="/crm/contacts/new"><Plus className="h-4 w-4" /> New contact</ButtonLink>
            )}
          </>
        }
      />
      <ContactFilters lk={lk} reps={reps} central />
      <ContactsTable user={user} rows={rows} total={total} page={page} pageSize={pageSize} base="/crm" params={flat} />
    </>
  );
}
