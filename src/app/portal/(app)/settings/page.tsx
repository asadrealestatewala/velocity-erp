import Link from "next/link";
import { db } from "@/lib/db";
import { dealershipIds, managedDealershipIds, requirePortalPage } from "@/server/authz";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { DEALERSHIP_STATUS } from "@/lib/constants";
import { humanize } from "@/lib/utils";
import { DealershipSettingsForm } from "./settings-form";

export const metadata = { title: "Dealership settings" };

export default async function PortalSettingsPage() {
  const user = await requirePortalPage();
  const managed = managedDealershipIds(user);
  const dealers = await db.dealership.findMany({
    where: { id: { in: dealershipIds(user) } },
    include: { city: true, province: true, bikeModels: { include: { bikeModel: { select: { name: true, isActive: true } } } } },
  });
  return (
    <>
      <PageHeader title="Dealership settings" description={<>Your dealership profile. Personal settings are under <Link href="/portal/account" className="link text-brand-600">Account</Link>.</>} />
      {dealers.map((d) => (
        <div key={d.id} className="mb-6 space-y-4">
          <Card>
            <CardHeader title={d.name} description={<span className="flex items-center gap-2">{d.code} · {humanize(d.type)} <Badge tone={DEALERSHIP_STATUS[d.status]!.tone}>{DEALERSHIP_STATUS[d.status]!.label}</Badge>{d.acceptsLeads ? <Badge tone="green">Receiving company leads</Badge> : <Badge tone="gray">Not receiving company leads</Badge>}</span>} />
            <div className="p-5">
              <DescriptionList cols={3} items={[
                { label: "Legal name", value: d.legalName }, { label: "City", value: d.city.name }, { label: "Province", value: d.province?.name },
                { label: "Address", value: d.address }, { label: "Postal code", value: d.postalCode },
                { label: "Eligible models", value: d.bikeModels.filter((b) => b.bikeModel.isActive).map((b) => b.bikeModel.name).join(", ") || "None configured" },
              ]} />
              <p className="mt-4 text-xs text-ink-400">Status, lead assignment, eligible models and identity details are managed by YADEA. Contact your YADEA account manager for changes.</p>
            </div>
          </Card>
          {managed.includes(d.id) && (
            <Card>
              <CardHeader title="Operational settings" description="Editable by dealership managers" />
              <DealershipSettingsForm id={d.id} initial={{ contactName: d.contactName, phone: d.phone, email: d.email, repsSeeAllLeads: d.repsSeeAllLeads, testDriveSlotCapacity: d.testDriveSlotCapacity, operatingHours: d.operatingHours as Record<string, { open: string; close: string; closed?: boolean }> }} />
            </Card>
          )}
        </div>
      ))}
    </>
  );
}
