import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { accessibleContact, accessibleLead } from "@/server/access";
import { listShowroomStock } from "@/server/services/inventory";
import { PageHeader } from "@/components/ui/misc";
import { SalesOrderForm } from "@/components/sales/order-form";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { fullName, sp } from "@/lib/utils";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("quotations.manage");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const stock = await listShowroomStock(dealershipId);

  let customer: { id: string; name: string; phone: string | null } | undefined;
  let leadId: string | undefined;
  try {
    const leadParam = sp(params.lead);
    const contactParam = sp(params.contact);
    if (leadParam) {
      const lead = await accessibleLead(user, leadParam);
      if (lead.dealershipId === dealershipId) {
        leadId = lead.id;
        const c = await accessibleContact(user, lead.contactId);
        customer = { id: c.id, name: fullName(c), phone: c.phone };
      }
    } else if (contactParam) {
      const c = await accessibleContact(user, contactParam);
      customer = { id: c.id, name: fullName(c), phone: c.phone };
    }
  } catch {
    customer = undefined;
  }

  return (
    <>
      <PageHeader
        title="New quotation"
        description="Price an offer for a customer. Nothing is deducted from stock until the quotation becomes a confirmed order."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Quotations", href: "/portal/quotations" }, { label: "New" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      {stock.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-600">Add the bikes and parts you sell under <b>Inventory</b> first — quotations are built from your showroom items.</div>
      ) : (
        <SalesOrderForm
          mode="quotation"
          dealershipId={dealershipId}
          initialCustomer={customer}
          leadId={leadId}
          items={stock.map((s) => ({ key: s.key, kind: s.kind, name: s.name, code: s.code, quantity: s.quantity, price: s.price ? Number(s.price) : null, currency: s.currency }))}
        />
      )}
    </>
  );
}
