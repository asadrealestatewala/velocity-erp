import { requirePortalPage } from "@/server/authz";
import { ContactEditPage } from "@/components/contacts/edit-page";

export const metadata = { title: "Edit contact" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalPage("contacts.edit");
  const { id } = await params;
  return <ContactEditPage user={user} id={id} base="/portal" />;
}