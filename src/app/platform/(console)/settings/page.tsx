import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { deleteAccountAction, saveAccountAction, saveSettingsAction, saveStripeAction, setStaff2faAction, testStripeAction } from "@/server/actions/platform";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { METHOD_LABEL } from "@/server/platform/billing";
import { platformDb } from "@/server/platform/client";
import { getPlatformSettings } from "@/server/platform/settings";
import { listPlans } from "@/server/platform/plans";
import { webhookUrl } from "@/server/platform/stripe";

export const metadata = { title: "Settings" };

const LOCAL = ["BANK_TRANSFER", "RAAST", "EASYPAISA", "JAZZCASH", "SADAPAY", "NAYAPAY"] as const;

export default async function SettingsPage() {
  await requireAdminPage("settings.manage");
  const [s, plans, accounts] = await Promise.all([getPlatformSettings(), listPlans(), platformDb().paymentAccount.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })]);
  const planOptions = plans.map((p) => ({ value: p.key, label: p.name }));
  const priceLines = Object.entries(s.billing.stripePrices).map(([k, v]) => `${k}=${v}`).join("\n");
  return (
    <>
      <PageHeader title="Settings" description="Trial, billing and payment details for the whole platform." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Trials, reminders and support" />
          <div className="p-5">
            <ActionForm
              action={saveSettingsAction}
              fields={[
                { name: "trialDays", label: "Free trial length (days, 0 = no trial)", type: "number", defaultValue: s.trialDays },
                { name: "trialPlanKey", label: "Plan used during the trial", type: "select", options: planOptions, defaultValue: s.trialPlanKey },
                { name: "graceDays", label: "Default grace days after a missed renewal", type: "number", defaultValue: s.graceDays },
                { name: "reminderDays", label: "Email reminders (days before expiry, comma separated)", defaultValue: s.reminderDays.join(", ") },
                { name: "oneTrialPerOwner", label: "Only one free trial per owner email", type: "checkbox", defaultValue: s.oneTrialPerOwner },
                { name: "supportEmail", label: "Support email", defaultValue: s.support.email },
                { name: "supportPhone", label: "Support phone / WhatsApp", defaultValue: s.support.phone },
                { name: "operatorEmail", label: "Email that receives payment notifications", defaultValue: s.billing.operatorEmail },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Staff two-factor sign-in" description="Staff who don't have it yet are taken to a set-up page the next time they open the console; they can't skip it, and nobody is locked out." />
          <div className="p-5">
            <ActionForm
              action={setStaff2faAction}
              fields={[{ name: "mode", label: "Require two-factor for", type: "select", options: [{ value: "all", label: "All platform staff (recommended)" }, { value: "privileged", label: "Owners and billing staff only" }, { value: "off", label: "Nobody (optional per person)" }], defaultValue: s.staff2fa }]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Card payments (Stripe)" description="Keys are encrypted before they are stored and are never displayed again. Leave a key empty to keep the saved one." />
          <div className="space-y-3 p-5">
            <p className="text-sm text-ink-600">Webhook endpoint to register in Stripe: <code className="font-mono break-all">{webhookUrl()}</code> (events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted).</p>
            <p className="text-sm text-ink-600">Secret key: {s.billing.stripeSecretKeyEnc ? "saved" : "not set"} · Webhook secret: {s.billing.stripeWebhookSecretEnc ? "saved" : "not set"} · Mode: {s.billing.stripeMode}</p>
            <ActionForm
              action={saveStripeAction}
              fields={[
                { name: "mode", label: "Mode", type: "select", options: [{ value: "test", label: "Test" }, { value: "live", label: "Live" }], defaultValue: s.billing.stripeMode },
                { name: "publishableKey", label: "Publishable key", optional: true, defaultValue: s.billing.stripePublishableKey },
                { name: "secretKey", label: "Secret key (sk_…)", type: "password", optional: true },
                { name: "webhookSecret", label: "Webhook signing secret (whsec_…)", type: "password", optional: true },
                { name: "prices", label: "Stripe price ids, one per line as plan_MONTH=price_… / plan_YEAR=price_… / plan_setup=price_…", type: "textarea", defaultValue: priceLines },
              ]}
            />
            <RunButton label="Test connection" action={testStripeAction} reload={false} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Bank and wallet accounts customers pay into" description="Shown on the customer's billing page. Customers send money here and submit the transaction reference." />
        <ul className="divide-y divide-ink-100 text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <span><strong>{a.title}</strong> · {METHOD_LABEL[a.method]} · {a.accountNo}{a.accountName ? ` · ${a.accountName}` : ""}{a.bankName ? ` · ${a.bankName}` : ""}{a.isActive ? "" : " · hidden"}</span>
              <RunButton label="Remove" variant="ghost" action={deleteAccountAction.bind(null, a.id)} />
            </li>
          ))}
          {!accounts.length && <li className="px-5 py-4 text-ink-500">None yet. Add at least one so customers can pay by bank transfer or wallet.</li>}
        </ul>
        <div className="border-t border-ink-100 p-5">
          <ActionForm
            submitLabel="Add account"
            reset
            action={saveAccountAction.bind(null, null)}
            fields={[
              { name: "method", label: "Method", type: "select", options: LOCAL.map((m) => ({ value: m, label: METHOD_LABEL[m] })) },
              { name: "title", label: "Display name", placeholder: "Meezan Bank" },
              { name: "accountNo", label: "Account / IBAN / wallet number" },
              { name: "accountName", label: "Account title", optional: true },
              { name: "bankName", label: "Bank name", optional: true },
              { name: "instructions", label: "Instructions for the customer", type: "textarea", optional: true },
              { name: "isActive", label: "Visible to customers", type: "checkbox", defaultValue: true },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
