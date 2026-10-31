import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, DescriptionList } from "@/components/ui/misc";
import { ActionForm, ReasonButton, RunButton } from "@/components/platform/console";
import { db as tenantDb } from "@/lib/db";
import { startViewAsAction } from "@/server/actions/impersonation";
import { cancelDeletionAction, scheduleDeletionAction } from "@/server/actions/platform";
import { setFlagOverrideAction } from "@/server/actions/platform";
import { flagsFor } from "@/server/platform/flags";
import { changePlanAction, grantAddOnAction, recordPaymentAction, saveNotesAction, setWorkspaceStatusAction, trialAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { deletionBlocker } from "@/server/platform/purge";
import { invoiceNumber, METHOD_LABEL } from "@/server/platform/billing";
import { platformDb } from "@/server/platform/client";
import { currentUsage } from "@/server/platform/guard";
import { entitlementsFor, listPlans } from "@/server/platform/plans";
import { runInTenant } from "@/server/platform/runtime";
import { fmtDateTime, fmtMoney } from "@/lib/utils";
import { SUB_TONE } from "@/components/platform/tones";

export const metadata = { title: "Workspace" };

export default async function WorkspaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage("tenants.view");
  const { id } = await params;
  const db = platformDb();
  const t = await db.tenant.findUnique({ where: { id }, include: { history: { orderBy: { at: "desc" }, take: 15 }, invoices: { orderBy: { issuedAt: "desc" }, take: 10 }, addOns: { include: { addOn: true } } } });
  if (!t) notFound();
  const viewable = adminCan(admin.role, "tenants.impersonate") && t.status !== "CANCELLED"
    ? await runInTenant(t.slug, () => tenantDb.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, email: true, role: { select: { name: true } } } })).catch(() => [])
    : [];
  const [plans, addOns, ent, usage] = await Promise.all([
    listPlans(),
    db.addOn.findMany({ orderBy: { key: "asc" } }),
    entitlementsFor(t),
    runInTenant(t.slug, () => currentUsage()).catch(() => null),
  ]);
  const can = (p: Parameters<typeof adminCan>[1]) => adminCan(admin.role, p);
  const [flagList, flagState, overrides] = can("flags.manage") ? await Promise.all([db.featureFlag.findMany({ where: { isArchived: false }, orderBy: { key: "asc" } }), flagsFor(t), db.tenantFlagOverride.findMany({ where: { tenantId: t.id } })]) : [[], {} as Awaited<ReturnType<typeof flagsFor>>, []];
  const planOptions = plans.map((p) => ({ value: p.key, label: p.name }));
  const interval = [{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }];
  const fmt = (n: number | null) => (n === null ? "unlimited" : n.toLocaleString("en-US"));
  return (
    <>
      <PageHeader title={t.name} description={`Code ${t.slug} · created ${fmtDateTime(t.createdAt)}`} breadcrumbs={[{ label: "Workspaces", href: "/platform/workspaces" }, { label: t.name }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Subscription" action={<Badge tone={SUB_TONE[t.subStatus]}>{t.subStatus.toLowerCase().replace("_", " ")}</Badge>} />
          <div className="p-5">
            <DescriptionList items={[
              { label: "Plan", value: t.planKey ?? "—" },
              { label: "Price", value: t.priceAmount ? `${fmtMoney(t.priceAmount, t.priceCurrency)} / ${t.interval === "YEAR" ? "year" : "month"}` : "—" },
              { label: "Trial ends", value: t.trialEndsAt ? fmtDateTime(t.trialEndsAt) : "—" },
              { label: "Period ends", value: t.currentPeriodEnd ? fmtDateTime(t.currentPeriodEnd) : "—" },
              { label: "Grace until", value: t.graceUntil ? fmtDateTime(t.graceUntil) : "—" },
              { label: "Workspace status", value: t.status.toLowerCase() },
              { label: "Owner", value: `${t.ownerName ?? "—"} · ${t.ownerEmail ?? "—"}${t.emailConfirmedAt ? "" : " (unconfirmed)"}` },
              { label: "Last seen", value: t.lastSeenAt ? fmtDateTime(t.lastSeenAt) : "—" },
              { label: "Database", value: `${t.dbSchema}${t.dbUrlEnc ? " (own connection)" : ""} · migrations v${t.schemaVersion}` },
              { label: "Coupon", value: t.couponCode ?? "—" },
            ]} />
            {viewable.length > 0 && (
              <div className="mt-4">
                <ReasonButton
                  label="View as user (read-only)"
                  title="View this workspace as one of its users"
                  description="Opens the workspace exactly as that person sees it, for 30 minutes. Nothing can be changed. Your reason is saved in the platform audit log and in the company's own audit log."
                  variant="secondary"
                  confirmLabel="Start read-only view"
                  action={startViewAsAction.bind(null, t.id)}
                  extra={[{ name: "userId", label: "View as", type: "select", options: viewable.map((u) => ({ value: u.id, label: `${u.name} · ${u.role.name} · ${u.email}` })), defaultValue: viewable[0]!.id }]}
                />
              </div>
            )}
            {!t.isLegacy && can("tenants.manage") && (
              <div className="mt-4 flex flex-wrap gap-2">
                {t.status === "SUSPENDED" ? (
                  <ReasonButton label="Reactivate" title="Reactivate this workspace?" variant="primary" action={setWorkspaceStatusAction.bind(null, t.id)} fixed={{ status: "ACTIVE" }} />
                ) : (
                  <ReasonButton label="Suspend" title="Suspend this workspace?" description="Nobody in this company can sign in until you reactivate it. Data is kept." variant="danger" action={setWorkspaceStatusAction.bind(null, t.id)} fixed={{ status: "SUSPENDED" }} />
                )}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Usage vs limits" />
          <ul className="space-y-2 p-5 text-sm">
            {usage ? (
              <>
                <li className="flex justify-between"><span>Staff logins</span><span>{usage.users} / {fmt(ent.maxUsers)}</span></li>
                <li className="flex justify-between"><span>Dealerships</span><span>{usage.dealerships} / {fmt(ent.maxDealerships)}</span></li>
                <li className="flex justify-between"><span>Contacts</span><span>{usage.contacts} / {fmt(ent.maxContacts)}</span></li>
                <li className="flex justify-between"><span>Storage (MB)</span><span>{usage.storageMb} / {fmt(ent.maxStorageMb)}</span></li>
              </>
            ) : <li className="text-ink-500">Usage unavailable (workspace database not reachable).</li>}
          </ul>
        </Card>
      </div>

      {!t.isLegacy && (can("tenants.export") || can("tenants.delete")) && (
        <Card className="mt-4">
          <CardHeader title="Data export and deletion" description="For customer requests and offboarding. Both are owner-only and recorded in the audit log with your reason." />
          <div className="space-y-4 p-5 text-sm">
            {t.dataPurgedAt ? (
              <p>All data of this workspace was erased on {fmtDateTime(t.dataPurgedAt)}. Invoices and payments are kept for accounting.</p>
            ) : (
              <>
                {can("tenants.export") && (
                  <form method="post" action={`/api/platform/workspaces/${t.id}/export`} className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-ink-600">Reason for the export
                      <input name="reason" required minLength={3} maxLength={300} className="input" placeholder="e.g. Customer data request, ticket 123" />
                    </label>
                    <button type="submit" className={buttonClass("secondary", "sm")}>Download full export (.zip)</button>
                  </form>
                )}
                <p className="text-xs text-ink-500">The export has one JSON-lines file per table plus every uploaded file. Password hashes, two-factor secrets and sign-in sessions are never included.</p>
                {can("tenants.delete") && (t.deletionScheduledFor ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-red-900">
                    <span>Deletion is scheduled: all data is erased after <strong>{fmtDateTime(t.deletionScheduledFor)}</strong>{t.deletionReason ? ` (${t.deletionReason})` : ""}.</span>
                    <RunButton label="Cancel deletion" action={cancelDeletionAction.bind(null, t.id)} />
                  </div>
                ) : deletionBlocker(t) ? (
                  <p className="text-ink-500">{deletionBlocker(t)}</p>
                ) : (
                  <ReasonButton
                    label="Schedule deletion"
                    title="Schedule deletion of this workspace?"
                    description={`All data and uploaded files will be permanently erased after the retention window, unless you cancel. Reactivating the workspace also cancels it. Invoices and payments are kept. Download an export first if the customer wants a copy.`}
                    variant="danger"
                    confirmLabel="Schedule deletion"
                    action={scheduleDeletionAction.bind(null, t.id)}
                    extra={[{ name: "confirmSlug", label: `Type the workspace code (${t.slug}) to confirm`, placeholder: t.slug }]}
                  />
                ))}
              </>
            )}
          </div>
        </Card>
      )}

      {!t.isLegacy && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {can("trials.manage") && (
            <Card>
              <CardHeader title="Trial controls" description="Every change needs a reason and is audited." />
              <div className="flex flex-wrap gap-2 p-5">
                {t.subStatus === "TRIALING" && (
                  <>
                    <ReasonButton label="Extend" title="Extend the trial" extra={[{ name: "days", label: "Days to add", type: "number", defaultValue: 7 }]} action={trialAction.bind(null, t.id)} fixed={{ kind: "extend" }} />
                    <ReasonButton label="Shorten" title="Shorten the trial" extra={[{ name: "days", label: "Days to remove", type: "number", defaultValue: 1 }]} action={trialAction.bind(null, t.id)} fixed={{ kind: "shorten" }} />
                    <ReasonButton label="End now" title="End the trial now?" variant="danger" action={trialAction.bind(null, t.id)} fixed={{ kind: "end" }} />
                  </>
                )}
                {t.subStatus !== "ACTIVE" && <ReasonButton label="Grant a trial" title="Grant a new trial" extra={[{ name: "days", label: "Trial days", type: "number", defaultValue: 7 }]} action={trialAction.bind(null, t.id)} fixed={{ kind: "grant" }} />}
                <ReasonButton label="Revoke trial rights" title="Revoke trial rights?" description="Ends access now and blocks this owner from starting another trial." variant="danger" action={trialAction.bind(null, t.id)} fixed={{ kind: "revoke" }} />
              </div>
            </Card>
          )}
          {can("payments.manage") && (
            <Card>
              <CardHeader title="Record a payment received" description="Money paid outside the app (bank, wallet, cash). Issues an invoice and activates the plan." />
              <div className="p-5">
                <ActionForm
                  submitLabel="Record payment"
                  action={recordPaymentAction.bind(null, t.id)}
                  fields={[
                    { name: "planKey", label: "Plan", type: "select", options: planOptions, defaultValue: t.planKey ?? planOptions[0]?.value },
                    { name: "interval", label: "Billing", type: "select", options: interval, defaultValue: t.interval },
                    { name: "amount", label: `Amount received (${t.currency})`, type: "number" },
                    { name: "method", label: "Method", type: "select", options: Object.entries(METHOD_LABEL).filter(([k]) => k !== "CARD").map(([value, label]) => ({ value, label })) },
                    { name: "reference", label: "Reference / transaction id", optional: true },
                    { name: "reason", label: "Note", type: "textarea" },
                  ]}
                />
              </div>
            </Card>
          )}
          {can("payments.manage") && (
            <Card>
              <CardHeader title="Change plan (no payment)" description="Complimentary or corrective. No invoice is created." />
              <div className="p-5">
                <ActionForm
                  submitLabel="Apply plan"
                  action={changePlanAction.bind(null, t.id)}
                  fields={[
                    { name: "planKey", label: "Plan", type: "select", options: planOptions, defaultValue: t.planKey ?? planOptions[0]?.value },
                    { name: "interval", label: "Billing", type: "select", options: interval, defaultValue: t.interval },
                    { name: "reason", label: "Reason", type: "textarea" },
                  ]}
                />
              </div>
            </Card>
          )}
          {can("payments.manage") && addOns.length > 0 && (
            <Card>
              <CardHeader title="Add-ons" description="Extra capacity on top of the plan." />
              <div className="space-y-3 p-5">
                {t.addOns.length > 0 && <ul className="text-sm">{t.addOns.map((a) => <li key={a.addOnId}>{a.addOn.name} × {a.quantity}</li>)}</ul>}
                <ActionForm
                  submitLabel="Apply add-on"
                  action={grantAddOnAction.bind(null, t.id)}
                  fields={[
                    { name: "addOnKey", label: "Add-on", type: "select", options: addOns.map((a) => ({ value: a.key, label: a.name })) },
                    { name: "quantity", label: "Quantity (0 removes)", type: "number", defaultValue: 1 },
                    { name: "reason", label: "Reason", type: "textarea" },
                  ]}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscription history" description="Append-only record of every change." />
          <ul className="divide-y divide-ink-100 text-sm">
            {t.history.map((h) => (
              <li key={h.id} className="px-5 py-2.5">
                <p className="font-medium">{(h.fromStatus ?? "—").toLowerCase()} → {h.toStatus.toLowerCase()}{h.planKey ? ` · ${h.planKey}` : ""}</p>
                <p className="text-xs text-ink-500">{fmtDateTime(h.at)} · {h.source.toLowerCase()}{h.actor ? ` · ${h.actor}` : ""}{h.reason ? ` · ${h.reason}` : ""}</p>
              </li>
            ))}
            {!t.history.length && <li className="px-5 py-4 text-ink-500">No changes yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Invoices" />
          <ul className="divide-y divide-ink-100 text-sm">
            {t.invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-5 py-2.5">
                <span><a className="link text-brand-600" href={`/api/platform/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">{invoiceNumber(i.number)}</a> · {fmtDateTime(i.issuedAt)}</span>
                <span>{fmtMoney(i.amount, i.currency)} <Badge tone={i.status === "PAID" ? "green" : "amber"}>{i.status.toLowerCase()}</Badge></span>
              </li>
            ))}
            {!t.invoices.length && <li className="px-5 py-4 text-ink-500">No invoices yet.</li>}
          </ul>
        </Card>
      </div>

      {can("flags.manage") && flagList.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Feature flags" description="Each flag shows what this workspace gets by default. An exception forces it on or off for this workspace only." />
          <ul className="divide-y divide-ink-100 text-sm">
            {flagList.map((f) => {
              const ov = overrides.find((o) => o.flagKey === f.key);
              const d = flagState[f.key];
              return (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                  <span><code>{f.key}</code> · {f.name} <Badge tone={d?.on ? "green" : "gray"}>{d?.on ? "on" : "off"}{d ? ` (${d.why})` : ""}</Badge>{ov ? <span className="ml-2 text-xs text-ink-500">exception by {ov.setBy ?? "?"}: {ov.reason}</span> : null}</span>
                  <span className="flex gap-2">
                    {(!ov || !ov.enabled) && <ReasonButton label="Force on" title={`Turn ${f.key} on for ${t.name}`} action={setFlagOverrideAction.bind(null, t.id)} fixed={{ flagKey: f.key, enabled: true }} />}
                    {(!ov || ov.enabled) && <ReasonButton label="Force off" title={`Turn ${f.key} off for ${t.name}`} variant="ghost" action={setFlagOverrideAction.bind(null, t.id)} fixed={{ flagKey: f.key, enabled: false }} />}
                    {ov && <RunButton label="Use default" variant="ghost" action={setFlagOverrideAction.bind(null, t.id, { flagKey: f.key, enabled: null })} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {can("tenants.manage") && (
        <Card className="mt-4">
          <CardHeader title="Internal notes" description="Visible to platform staff only." />
          <div className="p-5">
            <ActionForm submitLabel="Save notes" action={saveNotesAction.bind(null, t.id)} fields={[{ name: "notes", label: "Notes", type: "textarea", defaultValue: t.notes ?? "" }]} />
          </div>
        </Card>
      )}
    </>
  );
}
