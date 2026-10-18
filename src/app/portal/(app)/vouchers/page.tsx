import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { PageHeader } from "@/components/ui/misc";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { VouchersPanel } from "@/components/accounts/vouchers-panel";
import { sp } from "@/lib/utils";

export const metadata = { title: "Expense vouchers" };

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("vouchers.manage");
  const raw = await searchParams;
  const dealershipId = activeDealershipId(user, sp(raw.dealership))!;
  return (
    <>
      <PageHeader
        title="Expense vouchers"
        description="Record showroom expenses and attach proof of payment, proof of invoice, invoices and receipts. Everything is kept for your taxation records."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Expense vouchers" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      <VouchersPanel dealershipId={dealershipId} mode="dealer" rawParams={raw} base="/portal/vouchers" canCreate={can(user, "vouchers.manage")} />
    </>
  );
}
