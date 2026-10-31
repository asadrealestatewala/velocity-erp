import { PageHeader } from "@/components/ui/misc";
import { MailTabs } from "@/components/platform/mail";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";

export const metadata = { title: "Mail" };

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage("mail.manage");
  return (
    <>
      <PageHeader title="Mail" description="Company mailboxes, the inbox, everything we send, and the wording and branding of every email." />
      <MailTabs canSettings={adminCan(admin.role, "mail.settings")} />
      {children}
    </>
  );
}
