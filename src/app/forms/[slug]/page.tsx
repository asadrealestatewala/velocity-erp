import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { can } from "@/server/authz";
import { getSettings } from "@/server/settings";
import { issueFormToken } from "@/server/services/form-token";
import { FormShell, PublicForm } from "@/components/forms/public-form";
import type { FormField, FormSettings } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await db.form.findUnique({ where: { slug }, select: { name: true, status: true } });
  return { title: form && form.status === "PUBLISHED" ? form.name : "Form", robots: { index: form?.status === "PUBLISHED", follow: false } };
}

export default async function PublicFormPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const form = await db.form.findUnique({ where: { slug }, include: { publishedVersion: true } });
  if (!form) notFound();

  // ?preview=1 renders the working draft for form managers only; submissions are disabled.
  const wantsPreview = sp.preview === "1";
  const user = wantsPreview ? await getCurrentUser() : null;
  const preview = wantsPreview && can(user, "forms.manage");

  let fields: FormField[];
  let settings: FormSettings;
  if (preview) {
    fields = (form.draftSchema as { fields: FormField[] }).fields;
    settings = form.draftSettings as FormSettings;
  } else {
    if (form.status !== "PUBLISHED" || !form.publishedVersion) return <Unavailable />;
    fields = (form.publishedVersion.schema as { fields: FormField[] }).fields;
    settings = form.publishedVersion.settings as FormSettings;
  }

  const [sys, cities, provinces, bikeModels] = await Promise.all([
    getSettings(),
    db.city.findMany({ where: { isActive: true, province: { isActive: true } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, provinceId: true } }),
    db.province.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.bikeModel.findMany({ where: { isActive: true, availability: { not: "DISCONTINUED" } }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const { token, idempotencyKey } = issueFormToken(form.id);

  return (
    <FormShell settings={settings} bike={form.type !== "DEALERSHIP_APPLICATION"}>
      <PublicForm
        slug={form.slug}
        fields={fields}
        settings={settings}
        token={token}
        idempotencyKey={idempotencyKey}
        initialOptions={{ cities, provinces, bikeModels }}
        consentText={sys.consentText}
        privacyPolicyUrl={sys.privacyPolicyUrl}
        mode={preview ? "preview" : "live"}
      />
    </FormShell>
  );
}

function Unavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#eef1f5] p-6">
      <div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-lg">
        <h1 className="text-xl font-bold text-ink-900">This form isn&apos;t available</h1>
        <p className="mt-2 text-sm text-ink-500">It may have been closed or moved. Please contact YADEA directly or try again later.</p>
      </div>
    </div>
  );
}
