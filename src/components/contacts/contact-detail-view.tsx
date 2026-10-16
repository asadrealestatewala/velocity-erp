import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, Bike, Building2, Flag, History, Inbox, Mail, MapPin, Phone, User } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { can, isCentral, managedDealershipIds } from "@/server/authz";
import { getContactDetail } from "@/server/queries/contact-detail";
import { lookups } from "@/server/lookups";
import { Avatar, Badge, Card, CardHeader, DescriptionList, PageHeader, StageBadge } from "@/components/ui/misc";
import { StageSelect } from "@/components/leads/lead-dialogs";
import { fmtDate, fmtDateTime, fmtMoney, fullName, humanize } from "@/lib/utils";
import { INQUIRY_CATEGORIES, INQUIRY_TYPES, ORIGIN_LABEL, SUBMISSION_STATUS, TEST_DRIVE_STATUS } from "@/lib/constants";
import { ContactSidePanel } from "./side-panel";
import { AvatarUpload, ContactQuickActions } from "./quick-actions";
import { TestDriveStatusControl } from "@/components/test-drives/status-control";

export async function ContactDetailView({ user, id, base, leadParam }: { user: CurrentUser; id: string; base: string; leadParam?: string }) {
  const data = await getContactDetail(user, id, leadParam);
  if (!data) notFound();
  const { contact: c, leads, lead } = data;
  const central = isCentral(user);
  const [lk, customFieldDefs, members] = await Promise.all([
    lookups(),
    db.customFieldDefinition.findMany({ where: { entity: "CONTACT", isActive: true }, orderBy: { sortOrder: "asc" } }),
    lead?.dealershipId
      ? db.dealershipMembership.findMany({ where: { dealershipId: lead.dealershipId, isActive: true, user: { isActive: true } }, include: { user: { select: { id: true, name: true } } } }).then((r) => r.map((m) => m.user))
      : central
        ? db.user.findMany({ where: { isActive: true, role: { scope: "CENTRAL" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
  ]);
  const name = fullName(c);
  const assignMode = lead
    ? central
      ? can(user, "leads.assign") ? ("central" as const) : null
      : can(user, "leads.assign_team") && lead.dealershipId && managedDealershipIds(user).includes(lead.dealershipId) ? ("team" as const) : null
    : null;
  const nextTd = data.testDrives.find((t) => ["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(t.status) && t.scheduledAt > new Date()) ?? data.testDrives[0];
  const prefs = (c.communicationPrefs ?? {}) as Record<string, boolean>;
  const custom = (c.customFields ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Contacts", href: `${base}/contacts` }, { label: name }]}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          {/* Header */}
          <Card className="overflow-hidden">
            <div className="h-14 bg-gradient-to-r from-ink-900 via-ink-800 to-brand-700" />
            <div className="px-5 pb-5">
              <div className="relative -mt-9 inline-block">
                <Avatar name={name} src={data.avatarFileId ? `/api/files/${data.avatarFileId}` : null} size={72} className="ring-4" />
                <AvatarUpload contactId={c.id} enabled={can(user, "contacts.edit")} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-ink-900">{c.salutation ? `${c.salutation} ` : ""}{name}</h1>
                    <Badge tone={c.type === "CUSTOMER" ? "green" : "gray"}>{c.type === "CUSTOMER" ? "Customer" : "Lead"}</Badge>
                    {c.isArchived && <Badge tone="red">Archived</Badge>}
                    {lead && <Badge tone={lead.origin === "COMPANY" ? "blue" : "brand"}>{ORIGIN_LABEL[lead.origin]}</Badge>}
                  </div>
                  {c.businessName && <p className="text-sm text-ink-500">{c.businessName}</p>}
                </div>
                {lead && (
                  <div>
                    {can(user, "leads.change_stage") ? (
                      <StageSelect leadId={lead.id} currentStageId={lead.stageId} stages={lk.stages} lossReasons={lk.lossReasons} models={lk.models} />
                    ) : (
                      <StageBadge name={lead.stage.name} color={lead.stage.color} />
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-x-6 gap-y-2 text-sm text-ink-600 sm:grid-cols-2 xl:grid-cols-3">
                <span className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-400" />{c.phone ?? "—"}</span>
                <span className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-ink-400" /><span className="truncate">{c.email ?? "—"}</span></span>
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-400" />{c.city?.name ?? "—"}</span>
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-ink-400" />{lead?.dealership?.name ?? <span className="text-red-600">Unassigned</span>}</span>
                <span className="flex items-center gap-2"><User className="h-4 w-4 text-ink-400" />{lead?.assignedUser?.name ?? "No sales rep"}</span>
              </div>
              <a href="#records" className="mt-3 inline-flex text-xs font-medium text-brand-600 hover:underline xl:hidden">Jump to activity, tasks, notes, documents &amp; payments ↓</a>
              <div className="mt-4 border-t border-ink-100 pt-4">
                <ContactQuickActions
                  base={base}
                  contactId={c.id}
                  phone={c.phone}
                  email={c.email}
                  lead={lead ? { id: lead.id, dealershipId: lead.dealershipId, userId: lead.assignedUserId, interestedModelId: lead.interestedModelId } : null}
                  can={{
                    edit: can(user, "contacts.edit"), log: can(user, "notes.manage"), followUp: can(user, "tasks.manage"), assign: assignMode,
                    testDrive: can(user, "testdrives.manage"), addLead: can(user, "contacts.create"),
                  }}
                  models={lk.models}
                  members={members}
                />
              </div>
            </div>
          </Card>

          {leads.length > 1 && (
            <Card className="p-2">
              <nav className="flex flex-wrap gap-1" aria-label="Leads of this contact">
                {leads.map((l) => (
                  <Link
                    key={l.id}
                    href={`${base}/contacts/${c.id}?lead=${l.id}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${l.id === lead?.id ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}
                  >
                    Lead #{l.number}
                    <span className="h-2 w-2 rounded-full" style={{ background: l.stage.color }} />
                    <span className="text-xs opacity-80">{l.stage.name} · {fmtDate(l.createdAt)}</span>
                  </Link>
                ))}
              </nav>
            </Card>
          )}

          <Card>
            <CardHeader title="General information" />
            <div className="p-5">
              <DescriptionList
                cols={3}
                items={[
                  { label: "First name", value: c.firstName },
                  { label: "Last name", value: c.lastName },
                  { label: "Date of birth", value: fmtDate(c.dateOfBirth) },
                  { label: "Gender", value: c.gender },
                  { label: "Profession", value: c.profession },
                  { label: "Contact number", value: c.phone },
                  { label: "Alternate number", value: c.alternatePhone },
                  { label: "Email", value: c.email },
                  { label: "Business name", value: c.businessName },
                  { label: "Website", value: c.website ? <a href={c.website} target="_blank" rel="noreferrer noopener" className="link">{c.website}</a> : null },
                  { label: "Address", value: c.address },
                  { label: "City", value: c.city?.name },
                  { label: "Province / state", value: c.province?.name },
                  { label: "Postal code", value: c.postalCode },
                  { label: "Country", value: c.country },
                  { label: "Contact source", value: c.source?.name },
                  { label: "Contact type", value: c.type === "CUSTOMER" ? "Customer" : "Lead" },
                  { label: "Created", value: `${fmtDateTime(c.createdAt)}${c.createdBy ? ` by ${c.createdBy.name}` : ""}` },
                  { label: "Lead owner", value: lead?.owner?.name ?? c.owner?.name },
                  { label: "Assigned dealership", value: lead?.dealership?.name },
                  { label: "Assigned sales rep", value: lead?.assignedUser?.name },
                  { label: "Marketing consent", value: c.consentMarketing ? `Yes · recorded ${fmtDate(c.consentRecordedAt)}` : "No" },
                  { label: "Preferred contact method", value: humanize(c.preferredContactMethod) || null },
                  { label: "Communication preferences", value: Object.entries(prefs).filter(([, v]) => v).map(([k]) => (k === "whatsapp" ? "WhatsApp" : k.toUpperCase() === "SMS" ? "SMS" : humanize(k))).join(", ") || null },
                ]}
              />
              {customFieldDefs.length > 0 && (
                <div className="mt-5 border-t border-ink-100 pt-5">
                  <DescriptionList cols={3} items={customFieldDefs.map((d) => ({ label: d.label, value: custom[d.key] === true ? "Yes" : custom[d.key] === false ? "No" : (custom[d.key] as string) || null }))} />
                </div>
              )}
            </div>
          </Card>

          {lead && (
            <Card>
              <CardHeader title={`Lead #${lead.number} — additional information`} description={`${INQUIRY_TYPES[lead.inquiryType]} · created ${fmtDateTime(lead.createdAt)}`} />
              <div className="p-5">
                <DescriptionList
                  cols={3}
                  items={[
                    { label: "Interested bike model", value: lead.interestedModel?.name },
                    { label: "Test-drive date & time", value: nextTd ? `${fmtDateTime(nextTd.scheduledAt)} · ${TEST_DRIVE_STATUS[nextTd.status]!.label}` : null },
                    { label: "Preferred dealership", value: lead.preferredDealership?.name },
                    { label: "Lead origin", value: `${ORIGIN_LABEL[lead.origin]}${lead.originDealership ? ` (${lead.originDealership.name})` : ""}` },
                    { label: "Inquiry category", value: lead.inquiryCategory ? INQUIRY_CATEGORIES[lead.inquiryCategory as keyof typeof INQUIRY_CATEGORIES] ?? lead.inquiryCategory : null },
                    { label: "Lead source", value: lead.source?.name },
                    { label: "Original attribution", value: lead.originalSource && lead.originalSource.id !== lead.source?.id ? lead.originalSource.name : lead.originalSource?.name },
                    { label: "Source form", value: lead.sourceForm?.name },
                    { label: "Campaign", value: lead.campaign ?? lead.utmCampaign },
                    { label: "UTM", value: [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ") || null },
                    { label: "Referral", value: lead.referralDetails },
                    { label: "Last contacted", value: fmtDateTime(lead.lastContactedAt) },
                    { label: "First response", value: fmtDateTime(lead.firstContactedAt) },
                    { label: "Next follow-up", value: lead.nextFollowUpAt ? <span className={lead.nextFollowUpAt < new Date() && lead.stage.kind === "OPEN" ? "font-semibold text-red-600" : ""}>{fmtDateTime(lead.nextFollowUpAt)}</span> : null },
                    { label: "Assigned at", value: fmtDateTime(lead.assignedAt) },
                    ...(lead.convertedAt ? [{ label: "Converted", value: `${fmtDateTime(lead.convertedAt)}${lead.conversionValue ? ` · ${fmtMoney(lead.conversionValue.toString())}` : ""}${lead.soldModel ? ` · ${lead.soldModel.name}` : ""}` }] : []),
                    ...(lead.lostAt ? [{ label: "Lost", value: `${fmtDateTime(lead.lostAt)} · ${lead.lossReason?.name ?? ""}${lead.lossNotes ? ` — ${lead.lossNotes}` : ""}` }] : []),
                  ]}
                />
                {lead.description && (
                  <div className="mt-5 rounded-xl bg-ink-50 p-4">
                    <p className="mb-1 text-xs font-medium text-ink-500">Inquiry description</p>
                    <p className="text-sm whitespace-pre-line text-ink-800">{lead.description}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Test drives" description={`${data.testDrives.length} booking(s)`} />
            {data.testDrives.length ? (
              <ul className="divide-y divide-ink-100">
                {data.testDrives.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Bike className="h-4 w-4 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">#{t.number} · {t.bikeModel.name}</p>
                      <p className="text-xs text-ink-500">{fmtDateTime(t.scheduledAt)} · {t.dealership.name}{t.assignedUser ? ` · ${t.assignedUser.name}` : ""}</p>
                      {t.feedback && <p className="mt-0.5 text-xs text-ink-600">Feedback: {t.feedback}</p>}
                    </div>
                    <TestDriveStatusControl bookingId={t.id} status={t.status} canManage={can(user, "testdrives.manage")} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-400">No test drives booked.</p>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Stage history" description="Every stage change, who made it and when" />
              <ol className="max-h-80 space-y-3 overflow-y-auto p-5">
                {data.stageHistory.map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <Flag className="mt-0.5 h-4 w-4 shrink-0" style={{ color: h.toStage.color }} />
                    <div>
                      <p className="text-ink-800">
                        {h.fromStage ? <>{h.fromStage.name} → </> : null}<b>{h.toStage.name}</b>
                      </p>
                      <p className="text-xs text-ink-400">{h.changedBy?.name ?? "System"} · {fmtDateTime(h.changedAt)}{h.note ? ` · ${h.note}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <CardHeader title="Assignment history" description="Automatic and manual (re)assignments" />
              <ol className="max-h-80 space-y-3 overflow-y-auto p-5">
                {data.assignmentHistory.length === 0 && <p className="text-sm text-ink-400">Never assigned.</p>}
                {data.assignmentHistory.map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    <div className="min-w-0">
                      <p className="text-ink-800">
                        {h.fromDealership ? <>{h.fromDealership.name} → </> : null}<b>{h.toDealership?.name ?? "Central queue"}</b>
                        {(h.toUser || h.fromUser) && <span className="text-ink-500"> · rep {h.fromUser ? `${h.fromUser.name} → ` : ""}{h.toUser?.name ?? "none"}</span>}
                      </p>
                      <p className="text-xs text-ink-400">
                        <Badge tone={h.type === "AUTOMATIC" ? "blue" : "gray"} className="mr-1">{h.type === "AUTOMATIC" ? "Automatic" : "Manual"}</Badge>
                        {h.assignedBy?.name ?? "System"} · {fmtDateTime(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {data.submissions.length > 0 && (
            <Card>
              <CardHeader title="Form submissions" description="Each inquiry is retained separately" />
              <ul className="divide-y divide-ink-100">
                {data.submissions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Inbox className="h-4 w-4 text-ink-400" />
                    <Link href={`/crm/submissions/${s.id}`} className="link flex-1">#{s.number} · {s.form.name}</Link>
                    <Badge tone={SUBMISSION_STATUS[s.status]!.tone}>{SUBMISSION_STATUS[s.status]!.label}</Badge>
                    <span className="text-xs text-ink-400">{fmtDateTime(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!central && (
            <p className="flex items-center gap-2 px-1 text-xs text-ink-400"><History className="h-3.5 w-3.5" /> You see records belonging to your dealership only.</p>
          )}
        </div>

        <div className="min-w-0 scroll-mt-20" id="records">
          <ContactSidePanel
            contactId={c.id}
            leadId={lead?.id ?? null}
            meId={user.id}
            central={central}
            members={members}
            can={{
              tasks: can(user, "tasks.manage"), notes: can(user, "notes.manage"), docsView: can(user, "documents.view"),
              docsManage: can(user, "documents.manage"), paymentsView: can(user, "payments.view"), paymentsManage: can(user, "payments.manage"),
            }}
            activities={data.activities}
            tasks={data.tasks}
            notes={data.notes}
            documents={data.documents}
            payments={data.payments.map((p) => ({ ...p, amount: Number(p.amount) }))}
          />
        </div>
      </div>
    </>
  );
}
