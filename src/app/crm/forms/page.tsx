import Link from "next/link";
import { subDays } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { fmtDateTime, humanize } from "@/lib/utils";
import { env } from "@/lib/env";
import { FormRowActions, NewFormButton } from "./form-actions";

export const metadata = { title: "Forms" };

const STATUS_TONE = { DRAFT: "gray", PUBLISHED: "green", UNPUBLISHED: "amber" } as const;

export default async function FormsPage() {
  await requireCentralPage("forms.manage");
  const since = subDays(new Date(), 7);
  const forms = await db.form.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      publishedVersion: { select: { version: true } },
      _count: { select: { submissions: true } },
      submissions: { where: { createdAt: { gte: since } }, select: { id: true } },
    },
  });
  return (
    <>
      <PageHeader
        title="Forms"
        description="Public lead-capture forms rendered from a saved, versioned schema"
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Forms" }]}
        actions={<NewFormButton />}
      />
      {forms.length === 0 ? (
        <div className="card"><EmptyState icon={FileText} title="No forms yet" action={<NewFormButton />} /></div>
      ) : (
        <TableWrap>
          <thead className="bg-ink-50/60">
            <tr>
              <th className="th">Form</th><th className="th">Type</th><th className="th">Status</th><th className="th">Created</th><th className="th">Last updated</th>
              <th className="th text-right">Submissions</th><th className="th text-right">Last 7 days</th><th className="th">Public URL</th><th className="th sr-only">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {forms.map((f) => (
              <tr key={f.id} className="hover:bg-ink-50/50">
                <td className="td"><Link href={`/crm/forms/${f.id}`} className="link">{f.name}</Link>{f.description && <p className="max-w-xs truncate text-xs text-ink-400">{f.description}</p>}</td>
                <td className="td">{humanize(f.type)}</td>
                <td className="td">
                  <Badge tone={STATUS_TONE[f.status]}>{humanize(f.status)}</Badge>
                  {f.publishedVersion && <span className="ml-1.5 text-xs text-ink-400">v{f.publishedVersion.version}</span>}
                </td>
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(f.createdAt)}</td>
                <td className="td text-xs whitespace-nowrap">{fmtDateTime(f.updatedAt)}</td>
                <td className="td text-right tabular-nums"><Link href={`/crm/submissions?form=${f.id}`} className="link">{f._count.submissions}</Link></td>
                <td className="td text-right tabular-nums">{f.submissions.length}</td>
                <td className="td">
                  <a href={`/forms/${f.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    /forms/{f.slug} <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-[11px] text-ink-400">{env.appUrl}/forms/{f.slug}</p>
                </td>
                <td className="td text-right"><FormRowActions id={f.id} slug={f.slug} status={f.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
