import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, History, MailWarning } from "lucide-react";
import { requireCentralPage } from "@/server/authz";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { PlanPicker, type PlanCard } from "@/components/billing/plan-picker";
import { BillingActions } from "@/components/billing/billing-actions";
import { billingState } from "@/server/platform/billing-state";
import { creditNoteNumber, invoiceNumber, METHOD_LABEL } from "@/server/platform/billing";
import { platformDb } from "@/server/platform/client";
import { currentUsage } from "@/server/platform/guard";
import { entitlementsFor, listPlans, priceOf } from "@/server/platform/plans";
import { currentTenant } from "@/server/platform/runtime";
import { stripeConfigured } from "@/server/platform/stripe";
import { fmtDateTime } from "@/lib/utils";
import { ResendConfirmation } from "@/components/billing/billing-actions";

export const metadata = { title: "Plan & billing" };
export const dynamic = "force-dynamic";

const STATUS_TONE = { TRIALING: "blue", ACTIVE: "green", PAST_DUE: "amber", CANCELED: "gray", EXPIRED: "red", PENDING: "amber", SUSPENDED: "red" } as const;
const STATUS_LABEL = { TRIALING: "Free trial", ACTIVE: "Active", PAST_DUE: "Payment overdue", CANCELED: "Cancelled", EXPIRED: "Expired", PENDING: "No plan yet", SUSPENDED: "Suspended" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("settings.manage");
  const t = await currentTenant();
  if (t.isLegacy) redirect("/crm/dashboard");
  const sp = await searchParams;
  const db = platformDb();
  const [plans, ent, usage, accounts, pending, invoices, history, card] = await Promise.all([
    listPlans({ visibleOnly: true }),
    entitlementsFor(t),
    currentUsage(),
    db.paymentAccount.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.payment.findMany({ where: { tenantId: t.id, status: "PENDING" }, orderBy: { submittedAt: "desc" } }),
    db.invoice.findMany({ where: { tenantId: t.id }, orderBy: { issuedAt: "desc" }, include: { refunds: true }, take: 24 }),
    db.subscriptionHistory.findMany({ where: { tenantId: t.id }, orderBy: { at: "desc" }, take: 8 }),
    stripeConfigured(),
  ]);
  const state = billingState(t);
  const cards: PlanCard[] = plans.map((p) => ({
    key: p.key, name: p.name, description: p.description, recommended: p.isRecommended,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
    limits: { users: p.maxUsers, dealerships: p.maxDealerships, contacts: p.maxContacts, storageMb: p.maxStorageMb },
    prices: { MONTH: priceOf(p, t.currency, "MONTH")?.amount ?? null, YEAR: priceOf(p, t.currency, "YEAR")?.amount ?? null },
  }));
  const meters = [
    { label: "Staff logins", used: usage.users, cap: ent.maxUsers },
    { label: "Dealerships", used: usage.dealerships, cap: ent.maxDealerships },
    { label: "Contacts", used: usage.contacts, cap: ent.maxContacts },
    { label: "File storage (MB)", used: usage.storageMb, cap: ent.maxStorageMb },
  ];

  return (
    <>
      <PageHeader title="Plan & billing" description={`${t.name} · workspace code ${t.slug}`} breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Plan & billing" }]} />
      {sp.paid === "1" && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thanks! Your card payment is being processed — your plan activates as soon as the payment provider confirms it (usually seconds).</p>}
      {!t.emailConfirmedAt && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <MailWarning className="h-4 w-4" aria-hidden /> Your email address is not confirmed yet, so you can&apos;t invite your team.
          <ResendConfirmation />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Current plan" action={<Badge tone={STATUS_TONE[t.subStatus]}>{STATUS_LABEL[t.subStatus]}</Badge>} />
          <div className="space-y-3 p-5">
            <p className="text-2xl font-bold text-ink-900 capitalize">{t.planKey ?? "No plan chosen"}</p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {t.subStatus === "TRIALING" && <div><dt className="text-ink-500">Trial ends</dt><dd className="font-medium">{fmtDateTime(t.trialEndsAt)}</dd></div>}
              {t.currentPeriodEnd && <div><dt className="text-ink-500">{t.subStatus === "CANCELED" ? "Access until" : "Current period ends"}</dt><dd className="font-medium">{fmtDateTime(t.currentPeriodEnd)}</dd></div>}
              {t.subStatus === "PAST_DUE" && t.graceUntil && <div><dt className="text-ink-500">Pay before</dt><dd className="font-medium text-amber-700">{fmtDateTime(t.graceUntil)}</dd></div>}
              {t.priceAmount > 0 && <div><dt className="text-ink-500">Price</dt><dd className="font-medium">{t.priceCurrency} {t.priceAmount.toLocaleString("en-US")} / {t.interval === "YEAR" ? "year" : "month"}</dd></div>}
            </dl>
            {state.banner && <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{state.banner.text}</p>}
            <BillingActions canCancel={t.subStatus === "ACTIVE"} hasCard={!!t.stripeCustomerId} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Usage" description="Against your plan's limits" />
          <ul className="space-y-4 p-5">
            {meters.map((m) => {
              const pct = m.cap ? Math.min(100, (m.used / m.cap) * 100) : 0;
              return (
                <li key={m.label}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-ink-700">{m.label}</span><span className="tabular-nums text-ink-500">{m.used.toLocaleString("en-US")} / {m.cap === null ? "∞" : m.cap.toLocaleString("en-US")}</span></div>
                  <ProgressBar value={pct} color={pct >= 90 ? "#dc2626" : pct >= 75 ? "#f59e0b" : undefined} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card className="mt-4 border-amber-200">
          <CardHeader title="Waiting for confirmation" description="We check that the money arrived, then activate your plan." />
          <ul className="divide-y divide-ink-100">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Badge tone="amber">Pending</Badge>
                <span className="font-medium">{p.planKey} · {p.interval === "YEAR" ? "yearly" : "monthly"}</span>
                <span className="tabular-nums">{p.currency} {p.amount.toLocaleString("en-US")}</span>
                <span className="text-ink-500">{METHOD_LABEL[p.method]} · ref {p.reference}</span>
                <span className="ml-auto text-xs text-ink-400">{fmtDateTime(p.submittedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6">
        <PlanPicker plans={cards} currency={t.currency} currentPlanKey={t.planKey} currentInterval={t.interval} stripeEnabled={card} hasPending={pending.length > 0} accounts={accounts.map((a) => ({ id: a.id, method: a.method, title: a.title, accountName: a.accountName, accountNo: a.accountNo, bankName: a.bankName, instructions: a.instructions }))} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Invoices" />
        {invoices.length ? (
          <TableWrap>
            <thead><tr><th className="th">Invoice</th><th className="th">Plan</th><th className="th">Period</th><th className="th text-right">Amount</th><th className="th">Paid by</th><th className="th sr-only">PDF</th></tr></thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {invoices.map((i) => {
                const refunded = i.refunds.reduce((a, r) => a + r.amount, 0);
                return (
                  <tr key={i.id}>
                    <td className="td font-medium">{invoiceNumber(i.number)}<span className="block text-xs font-normal text-ink-400">{fmtDateTime(i.issuedAt)}</span></td>
                    <td className="td capitalize">{i.planKey} · {i.interval === "YEAR" ? "yearly" : "monthly"}</td>
                    <td className="td text-xs">{i.periodStart.toISOString().slice(0, 10)} → {i.periodEnd.toISOString().slice(0, 10)}</td>
                    <td className="td text-right tabular-nums">{i.currency} {i.amount.toLocaleString("en-US")}{refunded > 0 && <span className="block text-xs text-red-600">refunded {refunded.toLocaleString("en-US")} {i.refunds.map((r) => <Link key={r.id} href={`/api/billing/credit-notes/${r.id}/pdf`} target="_blank" className="ml-1 underline">{creditNoteNumber(r.number)}</Link>)}</span>}</td>
                    <td className="td">{METHOD_LABEL[i.method]}</td>
                    <td className="td text-right"><Link href={`/api/billing/invoices/${i.id}/pdf`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"><FileText className="h-4 w-4" aria-hidden /> PDF</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState icon={FileText} title="No invoices yet" description="Invoices appear here after your first payment." />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Subscription history" />
        <ul className="divide-y divide-ink-100">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              <span className="flex-1"><b className="font-medium">{h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ""}{STATUS_LABEL[h.toStatus]}</b>{h.reason ? <span className="text-ink-500"> — {h.reason}</span> : null}</span>
              <span className="text-xs text-ink-400">{fmtDateTime(h.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
