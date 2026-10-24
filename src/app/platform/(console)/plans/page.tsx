import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { saveAddOnAction, saveCouponAction, savePlanAction, savePriceAction, toggleCouponAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { listPlans } from "@/server/platform/plans";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Plans & coupons" };

const INTERVALS = [{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }];
const CURRENCIES = [{ value: "PKR", label: "PKR" }, { value: "USD", label: "USD" }];

export default async function PlansPage() {
  const admin = await requireAdminPage("coupons.manage");
  const canPlans = adminCan(admin.role, "plans.manage");
  const db = platformDb();
  const [plans, coupons, addOns] = await Promise.all([listPlans(), db.coupon.findMany({ orderBy: { createdAt: "desc" } }), db.addOn.findMany({ orderBy: { key: "asc" } })]);
  const planOptions = plans.map((p) => ({ value: p.key, label: p.name }));
  return (
    <>
      <PageHeader title="Plans & coupons" description="Limits apply to customers immediately. A new price applies to new purchases and renewals; past invoices keep what they charged." />
      {canPlans && plans.map((p) => (
        <Card key={p.id} className="mb-4">
          <CardHeader title={p.name} description={`Key: ${p.key}`} action={<div className="flex gap-1">{p.isVisible ? <Badge tone="green">on sale</Badge> : <Badge>hidden</Badge>}{p.isRecommended && <Badge tone="blue">recommended</Badge>}</div>} />
          <div className="grid gap-6 p-5 xl:grid-cols-[2fr_1fr]">
            <ActionForm
              submitLabel="Save plan"
              action={savePlanAction.bind(null, p.id)}
              fields={[
                { name: "name", label: "Name", defaultValue: p.name },
                { name: "description", label: "Short description", optional: true, defaultValue: p.description ?? "" },
                { name: "maxUsers", label: "Staff logins", type: "number", defaultValue: p.maxUsers },
                { name: "maxDealerships", label: "Dealerships", type: "number", defaultValue: p.maxDealerships },
                { name: "maxContacts", label: "Contacts", type: "number", defaultValue: p.maxContacts },
                { name: "maxStorageMb", label: "Storage (MB)", type: "number", defaultValue: p.maxStorageMb },
                { name: "graceDays", label: "Grace days after a missed renewal", type: "number", defaultValue: p.graceDays },
                { name: "features", label: "Feature bullets (one per line)", type: "textarea", defaultValue: (Array.isArray(p.features) ? (p.features as string[]) : []).join("\n") },
                { name: "procurement", label: "Includes procurement & inventory", type: "checkbox", defaultValue: p.procurement },
                { name: "assistant", label: "Includes the AI assistant", type: "checkbox", defaultValue: p.assistant },
                { name: "apiAccess", label: "Includes API access", type: "checkbox", defaultValue: p.apiAccess },
                { name: "isVisible", label: "Show on the pricing page", type: "checkbox", defaultValue: p.isVisible },
                { name: "isRecommended", label: "Mark as recommended", type: "checkbox", defaultValue: p.isRecommended },
                { name: "trialEligible", label: "Can be used for the free trial", type: "checkbox", defaultValue: p.trialEligible },
              ]}
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">Current prices</p>
              <ul className="mb-3 space-y-1 text-sm text-ink-600">
                {p.prices.filter((x) => x.isActive).map((x) => <li key={x.id}>{x.currency} {x.amount.toLocaleString("en-US")} / {x.interval === "YEAR" ? "year" : "month"}{x.setupFee ? ` + ${x.setupFee.toLocaleString("en-US")} setup` : ""}</li>)}
                {!p.prices.some((x) => x.isActive) && <li>No prices set.</li>}
              </ul>
              <ActionForm
                submitLabel="Set new price"
                reset
                action={savePriceAction.bind(null, p.id)}
                fields={[
                  { name: "currency", label: "Currency", type: "select", options: CURRENCIES, defaultValue: "PKR" },
                  { name: "interval", label: "Billing", type: "select", options: INTERVALS, defaultValue: "MONTH" },
                  { name: "amount", label: "Price", type: "number" },
                  { name: "setupFee", label: "One-time setup fee", type: "number", defaultValue: 0 },
                ]}
              />
            </div>
          </div>
        </Card>
      ))}

      <Card className="mb-4">
        <CardHeader title="Coupons" description="Validated on the server for plan, interval, currency, expiry and usage count." />
        <ul className="divide-y divide-ink-100 text-sm">
          {coupons.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <span><code className="font-mono font-semibold">{c.code}</code> · {c.percentOff ? `${c.percentOff}% off` : `${c.currency} ${c.amountOff} off`}{c.planKey ? ` · ${c.planKey} only` : ""}{c.interval ? ` · ${c.interval.toLowerCase()}` : ""} · used {c.uses}{c.maxUses ? `/${c.maxUses}` : ""}{c.validTo ? ` · until ${fmtDate(c.validTo)}` : ""}</span>
              <RunButton label={c.isActive ? "Disable" : "Enable"} action={toggleCouponAction.bind(null, c.id, !c.isActive)} />
            </li>
          ))}
          {!coupons.length && <li className="px-5 py-4 text-ink-500">No coupons yet.</li>}
        </ul>
        <div className="border-t border-ink-100 p-5">
          <p className="mb-3 text-sm font-semibold text-ink-700">New coupon</p>
          <ActionForm
            submitLabel="Create coupon"
            reset
            action={saveCouponAction}
            fields={[
              { name: "code", label: "Code", placeholder: "LAUNCH20" },
              { name: "percentOff", label: "Percent off (or leave empty)", type: "number", optional: true },
              { name: "amountOff", label: "Fixed amount off (or leave empty)", type: "number", optional: true },
              { name: "currency", label: "Currency for fixed amount", type: "select", options: CURRENCIES, optional: true },
              { name: "planKey", label: "Only for plan", type: "select", options: planOptions, optional: true },
              { name: "interval", label: "Only for billing", type: "select", options: INTERVALS, optional: true },
              { name: "maxUses", label: "Max uses", type: "number", optional: true },
              { name: "validTo", label: "Valid until", type: "date", optional: true },
              { name: "firstPaymentOnly", label: "First payment only", type: "checkbox", defaultValue: true },
            ]}
          />
        </div>
      </Card>

      {canPlans && (
        <Card>
          <CardHeader title="Add-ons" description="Extra capacity you can grant a workspace on top of its plan." />
          <ul className="divide-y divide-ink-100 text-sm">
            {addOns.map((a) => <li key={a.id} className="px-5 py-2.5"><strong>{a.name}</strong> <span className="text-ink-500">({a.key})</span> — +{a.extraUsers} users, +{a.extraDealerships} dealerships, +{a.extraContacts} contacts, +{a.extraStorageMb} MB{a.giveApiAccess ? ", API" : ""}</li>)}
            {!addOns.length && <li className="px-5 py-4 text-ink-500">No add-ons yet.</li>}
          </ul>
          <div className="border-t border-ink-100 p-5">
            <ActionForm
              submitLabel="Save add-on"
              reset
              action={saveAddOnAction}
              fields={[
                { name: "key", label: "Key", placeholder: "extra-users" },
                { name: "name", label: "Name" },
                { name: "extraUsers", label: "Extra staff logins", type: "number", defaultValue: 0 },
                { name: "extraDealerships", label: "Extra dealerships", type: "number", defaultValue: 0 },
                { name: "extraContacts", label: "Extra contacts", type: "number", defaultValue: 0 },
                { name: "extraStorageMb", label: "Extra storage (MB)", type: "number", defaultValue: 0 },
                { name: "priceMonthPkr", label: "Monthly price PKR", type: "number", defaultValue: 0 },
                { name: "priceMonthUsd", label: "Monthly price USD", type: "number", defaultValue: 0 },
                { name: "giveApiAccess", label: "Gives API access", type: "checkbox" },
              ]}
            />
          </div>
        </Card>
      )}
    </>
  );
}
