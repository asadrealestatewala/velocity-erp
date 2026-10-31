import { BrandEditor } from "@/components/platform/mail";
import { previewBrandAction, saveBrandAction } from "@/server/actions/platform-mail";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { loadMailConfig } from "@/server/platform/mail-config";

export const metadata = { title: "Branding · Mail" };

export default async function BrandingPage() {
  await requireAdminPage("mail.settings");
  const { brand } = await loadMailConfig();
  return (
    <>
      <p className="mb-4 text-sm text-ink-600">Every email the platform sends — templates, receipts, invitations, resets and staff replies — uses this company information in its header and footer.</p>
      <BrandEditor initial={brand} save={saveBrandAction} preview={previewBrandAction} />
    </>
  );
}
