import { activeDealershipId, requirePortalPage } from "@/server/authz";
import { accessibleContact, accessibleLead } from "@/server/access";
import { listShowroomStock } from "@/server/services/inventory";
import { PageHeader } from "@/components/ui/misc";
import { SalesOrderForm } from "@/components/sales/order-form";
import { DealershipSwitch } from "@/components/shell/dealership-switch";
import { fullName, sp } from "@/lib/utils";

export const metadata = { title: "New customer order" };

export default async function NewSalesOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("salesorders.manage");
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const stock = (await listShowroomStock(dealershipId)).filter((s) => s.quantity > 0);

  // Arriving from a contact or lead pre-fills the customer; an out-of-scope id simply starts blank.
  let customer: { id: string; name: string; phone: string | null } | undefined;
  let leadId: string | undefined;
  const leadParam = sp(params.lead);
  const contactParam = sp(params.contact);
  try {
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
        title="New customer order"
        description="Choose what the customer is buying. Confirming the order deducts it from your showroom inventory."
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Customer orders", href: "/portal/sales-orders" }, { label: "New" }]}
        actions={<DealershipSwitch options={user.memberships.map((m) => ({ id: m.dealershipId, name: m.dealershipName }))} value={dealershipId} />}
      />
      {stock.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-600">
          Your showroom has nothing in stock to sell. Add your stock under <b>Inventory</b>, or place an order with YADEA under <b>Stock orders</b>.
        </div>
      ) : (
        <SalesOrderForm
          dealershipId={dealershipId}
          initialCustomer={customer}
          leadId={leadId}
          items={stock.map((s) => ({ key: s.key, kind: s.kind, name: s.name, code: s.code, quantity: s.quantity, price: s.price ? Number(s.price) : null, currency: s.currency }))}
        />
      )}
    </>
  );
}
