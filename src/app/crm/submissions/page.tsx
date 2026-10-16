import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { lookups, opt } from "@/server/lookups";
import { FilterBar } from "@/components/filters/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination, TableWrap, parseListParams } from "@/components/ui/table";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { SUBMISSION_STATUS } from "@/lib/constants";

export const metadata = { title: "Form submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCentralPage("submissions.view");
  const { flat: p, page, pageSize, skip } = parseListParams(await searchParams);
  const and: Prisma.FormSubmissionWhereInput[] = [];
  if (p.form) and.push({ formId: p.form });
  if (p.status) and.push({ status: p.status as "NEW" });
  else and.push({ status: { not: "SPAM" } });
  if (p.duplicates === "yes") and.push({ isDuplicate: true });
  if (p.city) and.push({ cityId: p.city });
  if (p.dealership) and.push({ dealershipId: p.dealership });
  if (p.from) and.push({ createdAt: { gte: startOfDay(new Date(p.from)) } });
  if (p.to) and.push({ createdAt: { lte: endOfDay(new Date(p.to)) } });
  if (p.q) and.push({ OR: [{ firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { phone: { contains: p.q } }, { email: { contains: p.q, mode: "insensitive" } }] });
  const where = { AND: and };

  const [rows, total, forms, lk, newCount] = await Promise.all([
    db.formSubmission.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take: pageSize,
      include: {
        form: { select: { name: true } }, city: { select: { name: true } }, dealership: { select: { name: true } }, bikeModel: { select: { name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } }, lead: { select: { dealership: { select: { name: true } } } },
      },
    }),
    db.formSubmission.count({ where }),
    db.form.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    lookups(),
    db.formSubmission.count({ where: { status: "NEW" } }),
  ]);

  return (
    <>
      <PageHeader title="Form submissions" description={`${newCount} new submission(s) awaiting review`} breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Form submissions" }]} />
      <FilterBar
        filters={[
          { type: "search", name: "q", label: "Search", placeholder: "Name, phone, email…" },
          { type: "select", name: "form", label: "All forms", options: opt(forms) },
          { type: "select", name: "status", label: "All (excl. spam)", options: Object.entries(SUBMISSION_STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
          { type: "select", name: "duplicates", label: "Duplicates", options: [{ value: "yes", label: "Duplicates only" }] },
          { type: "select", name: "city", label: "Any city", options: opt(lk.cities) },
          { type: "select", name: "dealership", label: "Any outlet", options: opt(lk.dealerships) },
          { type: "daterange", from: "from", to: "to", label: "Submitted" },
        ]}
      />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Inbox} title="No submissions" description="Submissions from published public forms appear here." action={<Link href="/crm/forms" className="link text-brand-600">Manage forms →</Link>} /></div>
      ) : (
        <TableWrap footer={<Pagination base="/crm/submissions" params={p} page={page} pageSize={pageSize} total={total} />}>
          <thead className="bg-ink-50/60">
            <tr>
              <th className="th">ID</th><th className="th">Form</th><th className="th">Submitted</th><th className="th">First name</th><th className="th">Last name</th>
              <th className="th">Phone</th><th className="th">Email</th><th className="th">City</th><th className="th">Selected outlet</th><th className="th">Model</th>
              <th className="th">Test drive</th><th className="th">Status</th><th className="th">Linked contact</th><th className="th">Assigned dealership</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/crm/submissions/${s.id}`} className="link">#{s.number}</Link></td>
                <td className="td max-w-[160px] truncate">{s.form.name}</td>
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(s.createdAt)}</td>
                <td className="td">{s.firstName ?? "—"}</td>
                <td className="td">{s.lastName ?? "—"}</td>
                <td className="td whitespace-nowrap">{s.phone ?? "—"}</td>
                <td className="td max-w-[160px] truncate">{s.email ?? "—"}</td>
                <td className="td">{s.city?.name ?? "—"}</td>
                <td className="td">{s.dealership?.name ?? "—"}</td>
                <td className="td">{s.bikeModel?.name ?? "—"}</td>
                <td className="td whitespace-nowrap">{s.testDriveAt ? fmtDate(s.testDriveAt) : "—"}</td>
                <td className="td">
                  <Badge tone={SUBMISSION_STATUS[s.status]!.tone}>{SUBMISSION_STATUS[s.status]!.label}</Badge>
                  {s.isDuplicate && s.status !== "DUPLICATE" && <Badge tone="amber" className="ml-1">Dup</Badge>}
                </td>
                <td className="td">{s.contact ? <Link href={`/crm/contacts/${s.contact.id}`} className="link">{fullName(s.contact)}</Link> : "—"}</td>
                <td className="td">{s.lead?.dealership?.name ?? (s.lead ? <span className="text-red-600">Unassigned</span> : "—")}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
