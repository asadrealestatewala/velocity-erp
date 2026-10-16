import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { fmtDateTime, fullName, humanize } from "@/lib/utils";
import { SUBMISSION_STATUS } from "@/lib/constants";
import { CRM_MAPPINGS, type FormField } from "@/lib/forms/schema";
import { SubmissionActions } from "./submission-actions";

export const metadata = { title: "Submission" };

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCentralPage("submissions.view");
  const { id } = await params;
  const s = await db.formSubmission.findUnique({
    where: { id },
    include: {
      form: true, formVersion: true, city: true, dealership: true, bikeModel: true, source: true, reviewedBy: { select: { name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      lead: { select: { id: true, number: true, dealershipId: true, assignedUserId: true, dealership: { select: { name: true } }, stage: { select: { name: true } } } },
      files: { include: { file: true } }, duplicateOf: { select: { id: true, number: true } }, duplicates: { select: { id: true, number: true, createdAt: true } },
      application: { select: { id: true, number: true } }, testDrive: { select: { id: true, number: true, status: true } },
    },
  });
  if (!s) notFound();
  const fields = (s.formVersion.schema as { fields: FormField[] }).fields;
  const data = s.data as Record<string, unknown>;

  // Resolve dynamic option ids (city/outlet/model/province) to names for display
  const ids = fields.filter((f) => f.optionsSource).map((f) => data[f.key]).filter((v): v is string => typeof v === "string");
  const [cities, dealers, models, provinces] = await Promise.all([
    db.city.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.dealership.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.bikeModel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.province.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const names = new Map([...cities, ...dealers, ...models, ...provinces].map((x) => [x.id, x.name]));
  const display = (f: FormField) => {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") return <span className="text-ink-300">—</span>;
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (Array.isArray(v)) return v.map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(", ");
    if (f.optionsSource) return names.get(v as string) ?? `${v} (no longer exists)`;
    if (f.options?.length) return f.options.find((o) => o.value === v)?.label ?? String(v);
    return String(v);
  };
  const log = (s.processingLog ?? []) as { at: string; step: string; detail?: string }[];

  return (
    <>
      <PageHeader
        title={`Submission #${s.number}`}
        description={`${s.form.name} · ${fmtDateTime(s.createdAt)}`}
        breadcrumbs={[{ label: "Form submissions", href: "/crm/submissions" }, { label: `#${s.number}` }]}
        actions={
          can(user, "submissions.manage") ? (
            <SubmissionActions
              id={s.id}
              status={s.status}
              isApplication={s.form.type === "DEALERSHIP_APPLICATION"}
              hasContact={!!s.contactId}
              hasLead={!!s.leadId}
              lead={s.lead ? { id: s.lead.id, dealershipId: s.lead.dealershipId, userId: s.lead.assignedUserId } : null}
              canAssign={can(user, "leads.assign")}
            />
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Submitted fields" description={`Rendered against schema version ${s.formVersion.version} (published ${fmtDateTime(s.formVersion.publishedAt)})`} />
            <div className="p-5">
              <DescriptionList
                items={fields.filter((f) => f.type !== "heading" && f.type !== "file").map((f) => ({
                  label: `${f.label}${f.mapTo ? ` → ${CRM_MAPPINGS[f.mapTo].split(" · ")[1]}` : ""}`,
                  value: display(f),
                }))}
              />
            </div>
          </Card>
          {s.files.length > 0 && (
            <Card>
              <CardHeader title="Uploaded files" description="Stored privately; downloads are access-controlled" />
              <ul className="divide-y divide-ink-100">
                {s.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <FileText className="h-4 w-4 text-ink-400" />
                    <a href={`/api/files/${f.file.id}`} target="_blank" rel="noreferrer" className="link flex-1 truncate">{f.file.originalName}</a>
                    <span className="text-xs text-ink-400">{(f.file.size / 1024).toFixed(0)} KB · {fmtDateTime(f.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Processing history" />
            <ol className="space-y-3 p-5">
              {log.map((l, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div><p className="font-medium text-ink-800">{humanize(l.step)}</p><p className="text-xs text-ink-400">{fmtDateTime(l.at)}{l.detail ? ` · ${l.detail}` : ""}</p></div>
                </li>
              ))}
              {log.length === 0 && <p className="text-sm text-ink-400">No processing steps recorded.</p>}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Status & links" />
            <div className="p-5">
              <DescriptionList
                cols={1}
                items={[
                  { label: "Status", value: <Badge tone={SUBMISSION_STATUS[s.status]!.tone}>{SUBMISSION_STATUS[s.status]!.label}</Badge> },
                  { label: "Linked contact", value: s.contact ? <Link href={`/crm/contacts/${s.contact.id}`} className="link">{fullName(s.contact)}</Link> : null },
                  { label: "Lead", value: s.lead ? `#${s.lead.number} · ${s.lead.stage.name}` : null },
                  { label: "Assigned dealership", value: s.lead?.dealership?.name ?? (s.lead ? "Unassigned" : null) },
                  { label: "Test-drive booking", value: s.testDrive ? `#${s.testDrive.number} · ${humanize(s.testDrive.status)}` : null },
                  { label: "Dealership application", value: s.application ? <Link href={`/crm/applications/${s.application.id}`} className="link">Application #{s.application.number}</Link> : null },
                  { label: "Reviewed", value: s.reviewedAt ? `${fmtDateTime(s.reviewedAt)} by ${s.reviewedBy?.name}` : null },
                  { label: "Duplicate of", value: s.duplicateOf ? <Link href={`/crm/submissions/${s.duplicateOf.id}`} className="link">#{s.duplicateOf.number}</Link> : null },
                  { label: "Later duplicates", value: s.duplicates.length ? s.duplicates.map((d) => <Link key={d.id} href={`/crm/submissions/${d.id}`} className="link mr-2">#{d.number}</Link>) : null },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Consent & source" />
            <div className="p-5">
              <DescriptionList
                cols={1}
                items={[
                  { label: "Consent given", value: s.consentGiven ? `Yes · ${fmtDateTime(s.consentAt)}` : "No" },
                  { label: "Consent wording shown", value: s.consentText },
                  { label: "Privacy policy URL", value: s.privacyPolicyUrl },
                  { label: "Source", value: s.source?.name },
                  { label: "UTM", value: Object.entries((s.utm ?? {}) as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(" · ") || null },
                  { label: "Referrer", value: s.referrer },
                  { label: "Client fingerprint", value: s.ipHash ? `IP hash ${s.ipHash.slice(0, 10)}…` : null },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
