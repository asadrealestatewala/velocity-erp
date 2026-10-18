import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { PageHeader } from "@/components/ui/misc";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { LedgerPanel } from "@/components/accounts/ledger-panel";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Account ledger" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("ledger.view");
  const { flat } = parseListParams(await searchParams);
  const dealershipId = activeDealershipId(user, flat.dealership)!;
  return (
    <>
      <PageHeader
        title="Account ledger"
        description="Your account with YADEA — invoices for stock orders, your payments and the running balance. Download it as Excel or PDF any time."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Ledger" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <LedgerPanel dealershipId={dealershipId} mode="dealer" params={flat} canPay={can(user, "ledger.pay")} />
    </>
  );
}
