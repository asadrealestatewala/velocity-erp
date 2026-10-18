import { can, requireProcurementPage } from "@/server/authz";
import { PageHeader } from "@/components/ui/misc";
import { VouchersPanel } from "@/components/accounts/vouchers-panel";

export const metadata = { title: "Expense vouchers" };

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage("vouchers.view_all");
  const raw = await searchParams;
  return (
    <>
      <PageHeader
        title="Expense vouchers"
        description="Vouchers submitted by dealerships with their receipts, invoices and proofs. Export them for tax records."
        breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Vouchers" }]}
      />
      <VouchersPanel dealershipId={null} mode="central" rawParams={raw} base="/procurement/vouchers" canReview={can(user, "vouchers.view_all")} />
    </>
  );
}
