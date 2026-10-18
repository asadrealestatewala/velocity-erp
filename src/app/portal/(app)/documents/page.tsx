import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { PageHeader } from "@/components/ui/misc";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { DocumentsPanel } from "@/components/accounts/documents-panel";
import { sp } from "@/lib/utils";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("dealerdocs.upload");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const m = user.memberships.find((x) => x.dealershipId === dealershipId)!;
  return (
    <>
      <PageHeader
        title="Documents"
        description="Your certificate of registration and other papers, kept in sync with YADEA. Achievement certificates awarded by YADEA appear here to download."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Documents" }]}
        actions={<DealershipSwitch options={user.memberships.map((x) => ({ id: x.dealershipId, name: x.dealershipName }))} value={dealershipId} />}
      />
      <DocumentsPanel dealershipId={dealershipId} dealershipName={m.dealershipName} mode="dealer" canUpload={can(user, "dealerdocs.upload")} />
    </>
  );
}
