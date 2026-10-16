import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { FormBuilder } from "@/components/forms/form-builder";
import { fmtDateTime } from "@/lib/utils";
import type { FormField, FormSettings } from "@/lib/forms/schema";

export const metadata = { title: "Form builder" };

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCentralPage("forms.manage");
  const { id } = await params;
  const form = await db.form.findUnique({
    where: { id },
    include: {
      publishedVersion: true,
      versions: { orderBy: { version: "desc" }, include: { publishedBy: { select: { name: true } }, _count: { select: { submissions: true } } } },
    },
  });
  if (!form) notFound();
  const sources = await db.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { key: true, name: true } });
  const dirtySincePublish =
    !!form.publishedVersion &&
    (JSON.stringify(form.publishedVersion.schema) !== JSON.stringify(form.draftSchema) || JSON.stringify(form.publishedVersion.settings) !== JSON.stringify(form.draftSettings));

  return (
    <>
      <PageHeader
        title="Form builder"
        description={<>Public URL: <a className="link text-brand-600" href={`/forms/${form.slug}`} target="_blank" rel="noreferrer">/forms/{form.slug}</a> · {form.type.replace(/_/g, " ").toLowerCase()}</>}
        breadcrumbs={[{ label: "Forms", href: "/crm/forms" }, { label: form.name }]}
      />
      <FormBuilder
        form={{
          id: form.id, slug: form.slug, name: form.name, description: form.description, type: form.type, status: form.status,
          fields: (form.draftSchema as { fields: FormField[] }).fields, settings: form.draftSettings as FormSettings, dirtySincePublish,
        }}
        sources={sources}
      />
      <Card className="mt-4">
        <CardHeader title="Version history" description="Each publish creates an immutable version. Submissions keep the version they were made with." />
        <ul className="divide-y divide-ink-100">
          {form.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="font-semibold">v{v.version}</span>
              {v.id === form.publishedVersionId && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">live</span>}
              <span className="text-ink-500">{fmtDateTime(v.publishedAt)} by {v.publishedBy?.name ?? "system"}</span>
              <span className="text-ink-400">· {(v.schema as { fields: unknown[] }).fields.length} fields</span>
              <Link href={`/crm/submissions?form=${form.id}`} className="ml-auto text-xs text-brand-600 hover:underline">{v._count.submissions} submission(s)</Link>
            </li>
          ))}
          {form.versions.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">Never published.</li>}
        </ul>
      </Card>
    </>
  );
}
