import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { lookups } from "@/server/lookups";
import { PageHeader } from "@/components/ui/misc";
import { DealershipForm } from "@/components/dealerships/dealership-form";

export const metadata = { title: "Edit dealership" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireCentralPage("dealerships.manage");
  const { id } = await params;
  const d = await db.dealership.findUnique({ where: { id } });
  if (!d) notFound();
  const [lk, parents] = await Promise.all([lookups(), db.dealership.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title={`Edit ${d.name}`} breadcrumbs={[{ label: "Dealerships", href: "/crm/dealerships" }, { label: d.name, href: `/crm/dealerships/${d.id}` }, { label: "Edit" }]} />
      <DealershipForm
        id={d.id}
        cities={lk.cities}
        provinces={lk.provinces}
        parents={parents}
        initial={{
          name: d.name, code: d.code, type: d.type, legalName: d.legalName, parentId: d.parentId, contactName: d.contactName, email: d.email, phone: d.phone,
          provinceId: d.provinceId, cityId: d.cityId, address: d.address, postalCode: d.postalCode,
          latitude: d.latitude ? Number(d.latitude) : null, longitude: d.longitude ? Number(d.longitude) : null,
          openingDate: (d.openingDate ? format(d.openingDate, "yyyy-MM-dd") : null) as unknown as Date,
          operatingHours: d.operatingHours as Record<string, { open: string; close: string }>, testDriveSlotCapacity: d.testDriveSlotCapacity,
          repsSeeAllLeads: d.repsSeeAllLeads, notes: d.notes,
        }}
      />
    </>
  );
}
