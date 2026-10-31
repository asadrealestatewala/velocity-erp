import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/misc";
import { TemplateEditor } from "@/components/platform/mail";
import { previewTemplateAction, resetTemplateAction, saveTemplateAction, testSendTemplateAction } from "@/server/actions/platform-mail";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { resolveTemplate } from "@/server/platform/mail-send";
import { GLOBAL_VARIABLES, REQUIRED_TEMPLATES, templateDef } from "@/server/platform/mail-templates";

export const metadata = { title: "Edit template · Mail" };

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdminPage("mail.settings");
  const { key } = await params;
  const def = templateDef(key);
  if (!def) notFound();
  const t = await resolveTemplate(key);
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/platform/mail/templates" className="text-brand-600 hover:underline">← All templates</Link></p>
      <h2 className="mb-1 text-lg font-semibold">{def.name}</h2>
      <p className="mb-4 text-sm text-ink-600">{def.description}</p>
      <TemplateEditor
        templateKey={key}
        initial={{ subject: t.subject, heading: t.heading, body: t.body, ctaLabel: t.ctaLabel, ctaUrl: t.ctaUrl, isEnabled: t.isEnabled }}
        canDisable={!REQUIRED_TEMPLATES.has(key)}
        customised={t.customised}
        defaultTo={admin.email}
        save={saveTemplateAction.bind(null, key)}
        reset={resetTemplateAction.bind(null, key)}
        preview={previewTemplateAction.bind(null, key)}
        testSend={testSendTemplateAction.bind(null, key)}
      />
      <Card className="mt-6">
        <CardHeader title="Variables" description="Type these in double braces, for example {{name}}. They are replaced with each customer's values when the email is sent." />
        <ul className="grid gap-x-6 gap-y-1 px-5 py-4 text-sm sm:grid-cols-2">
          {[...def.variables.map((v) => ({ name: v.name, help: `${v.help} — e.g. ${v.sample}` })), ...GLOBAL_VARIABLES].map((v) => (
            <li key={v.name}><code className="font-mono text-brand-700">{`{{${v.name}}}`}</code> <span className="text-ink-600">{v.help}</span></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
