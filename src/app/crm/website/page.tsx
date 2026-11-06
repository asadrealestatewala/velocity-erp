import { ExternalLink } from "lucide-react";
import { requireCentralPage } from "@/server/authz";
import { getWebsite, siteAddresses } from "@/server/website";
import { currentTenant } from "@/server/platform/runtime";
import { entitlementsFor } from "@/server/platform/plans";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { WebsiteEditor } from "./website-editor";

export const metadata = { title: "Website" };

export default async function WebsitePage() {
  await requireCentralPage("settings.manage");
  const tenant = await currentTenant();
  const [site, sys, forms, addr, ent] = await Promise.all([
    getWebsite(),
    getSettings(),
    db.form.findMany({ where: { status: "PUBLISHED" }, orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    siteAddresses(),
    entitlementsFor(tenant),
  ]);
  const allowed = tenant.isLegacy || ent.website;
  return (
    <>
      <PageHeader
        title="Website"
        description="Publish a simple public website for your business: home page, bike models, showrooms and contact."
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Website" }]}
        actions={<a href="/site" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:underline"><ExternalLink className="h-4 w-4" /> Open website</a>}
      />
      {!allowed ? (
        <Card><CardHeader title="Website builder is not on your plan" description="Upgrade in Plan & billing to publish your own website." /></Card>
      ) : (
        <Card>
          <CardHeader title="Website content" description="Changes appear on the public site as soon as you save while it is published." />
          <WebsiteEditor initial={{ ...site, siteName: site.siteName || sys.companyName }} forms={forms} appUrl={env.appUrl} addresses={addr} />
        </Card>
      )}
    </>
  );
}
