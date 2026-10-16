import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireCentralPage } from "@/server/authz";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { OnboardingChecklist, ReviewNoteForm, ReviewPanel } from "@/components/applications/review-controls";
import { fmtDateTime } from "@/lib/utils";
import { APPLICATION_STATUS } from "@/lib/constants";

export const metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCentralPage("applications.view");
  const { id } = await params;
  const a = await db.dealershipApplication.findUnique({
    where: { id },
    include: {
      city: true, province: true, reviewer: { select: { name: true } }, submission: { select: { id: true, number: true } },
      documents: { include: { file: true }, orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      dealership: { include: { _count: { select: { bikeModels: true } }, memberships: { where: { isActive: true, role: "MANAGER" }, select: { id: true } } } },
    },
  });
  if (!a) notFound();
  const review = can(user, "applications.review");
  const [reviewers, cities] = await Promise.all([
    db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permission: { key: "applications.review" } } } } }, select: { id: true, name: true } }),
    db.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const ob = (a.onboarding ?? {}) as { verified?: boolean; notified?: boolean };

  return (
    <>
      <PageHeader
        title={a.businessName}
        description={<span className="flex flex-wrap items-center gap-2">Application #{a.number} · submitted {fmtDateTime(a.createdAt)}<Badge tone={APPLICATION_STATUS[a.status]!.tone}>{APPLICATION_STATUS[a.status]!.label}</Badge></span>}
        breadcrumbs={[{ label: "Applications", href: "/crm/applications" }, { label: `#${a.number}` }]}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Applicant information" />
            <div className="p-5">
              <DescriptionList cols={3} items={[
                { label: "Salutation", value: a.salutation }, { label: "First name", value: a.firstName }, { label: "Last name", value: a.lastName },
                { label: "Email", value: <a className="link" href={`mailto:${a.email}`}>{a.email}</a> }, { label: "Phone", value: <a className="link" href={`tel:${a.phone}`}>{a.phone}</a> },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Business, location & structure" />
            <div className="p-5">
              <DescriptionList cols={3} items={[
                { label: "Current business name", value: a.businessName }, { label: "Business address", value: a.businessAddress },
                { label: "Years in automotive business", value: a.yearsInBusiness }, { label: "Currently an OEM dealer", value: a.isOemDealer == null ? null : a.isOemDealer ? "Yes" : "No" },
                { label: "Province", value: a.province?.name }, { label: "City", value: a.city?.name },
                { label: "Property ownership", value: a.propertyOwnership }, { label: "Business structure", value: a.businessStructure },
                { label: "Consent", value: a.consentGiven ? `Given · ${fmtDateTime(a.consentAt)}` : "Not given" },
                { label: "Source submission", value: a.submission ? <Link className="link" href={`/crm/submissions/${a.submission.id}`}>#{a.submission.number}</Link> : "Created by staff" },
                ...(a.decisionReason ? [{ label: "Decision reason", value: a.decisionReason }] : []),
                ...(a.infoRequest ? [{ label: "Information requested", value: a.infoRequest }] : []),
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Supporting documents" description="Private files — access-controlled downloads" />
            <ul className="divide-y divide-ink-100">
              {a.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <FileText className="h-4 w-4 text-ink-400" />
                  <a href={`/api/files/${d.file.id}`} target="_blank" rel="noreferrer" className="link flex-1 truncate">{d.file.originalName}</a>
                  <span className="text-xs text-ink-400">{d.category} · {(d.file.size / 1024).toFixed(0)} KB · {fmtDateTime(d.createdAt)}</span>
                </li>
              ))}
              {a.documents.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No documents uploaded.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Internal review notes" description="Never visible to the applicant" />
            <ul className="divide-y divide-ink-100">
              {a.notes.map((n) => (
                <li key={n.id} className="px-5 py-3 text-sm"><p className="whitespace-pre-line text-ink-800">{n.body}</p><p className="mt-1 text-xs text-ink-400">{n.author.name} · {fmtDateTime(n.createdAt)}</p></li>
              ))}
              {a.notes.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No notes yet.</li>}
            </ul>
            {review && <ReviewNoteForm id={a.id} />}
          </Card>
        </div>
        <div className="space-y-4">
          {review && (
            <Card>
              <CardHeader title="Review" description={a.reviewer ? `Reviewer: ${a.reviewer.name}` : "No reviewer assigned"} />
              <ReviewPanel id={a.id} status={a.status} reviewerId={a.reviewerId} reviewers={reviewers} />
            </Card>
          )}
          {(a.status === "APPROVED" || a.dealership) && (
            <Card>
              <CardHeader title="Onboarding" description="Approval and activation are separate. Each step unlocks the next." />
              {review ? (
                <OnboardingChecklist
                  id={a.id}
                  applicant={{ name: `${a.firstName} ${a.lastName}`, email: a.email, phone: a.phone }}
                  cities={cities}
                  defaults={{ name: a.businessName, cityId: a.cityId, address: a.businessAddress }}
                  o={{
                    approved: a.status === "APPROVED", verified: !!ob.verified, notified: !!ob.notified,
                    dealership: a.dealership ? { id: a.dealership.id, name: a.dealership.name, status: a.dealership.status, acceptsLeads: a.dealership.acceptsLeads, models: a.dealership._count.bikeModels, managers: a.dealership.memberships.length } : null,
                  }}
                />
              ) : <p className="p-5 text-sm text-ink-500">Onboarding is managed by reviewers.</p>}
            </Card>
          )}
          <Card>
            <CardHeader title="Status history" />
            <ol className="space-y-3 p-5">
              {a.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="text-ink-800">{h.fromStatus ? `${APPLICATION_STATUS[h.fromStatus]!.label} → ` : ""}<b>{APPLICATION_STATUS[h.toStatus]!.label}</b></p>
                  <p className="text-xs text-ink-400">{h.changedBy?.name ?? "Applicant"} · {fmtDateTime(h.createdAt)}</p>
                  {h.note && <p className="mt-0.5 text-xs text-ink-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
