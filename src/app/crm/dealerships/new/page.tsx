import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { DealershipForm } from "@/components/dealerships/dealership-form";

export const metadata = { title: "New dealership" };

export default async function Page() {
  await requireCentralPage("dealerships.manage");
  const [lk, parents] = await Promise.all([lookups(), db.dealership.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="New dealership" description="New dealerships start as Pending and do not receive leads until onboarding is complete." breadcrumbs={[{ label: "Dealerships", href: "/crm/dealerships" }, { label: "New" }]} />
      <DealershipForm id={null} initial={{}} cities={lk.cities} provinces={lk.provinces} parents={parents} />
    </>
  );
}
