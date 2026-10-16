import { requireCentralPage } from "@/server/authz";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";
import { sp } from "@/lib/utils";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("contacts.view");
  const [{ id }, s] = await Promise.all([params, searchParams]);
  return <ContactDetailView user={user} id={id} base="/crm" leadParam={sp(s.lead)} />;
}
