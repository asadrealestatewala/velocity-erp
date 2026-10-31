import Link from "next/link";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { MAIL_CATEGORIES, REQUIRED_TEMPLATES, TEMPLATES } from "@/server/platform/mail-templates";

export const metadata = { title: "Templates · Mail" };

export default async function TemplatesPage() {
  await requireAdminPage("mail.settings");
  const rows = new Map((await platformDb().mailTemplate.findMany()).map((r) => [r.key, r]));
  return (
    <div className="space-y-4">
      {MAIL_CATEGORIES.filter((c) => TEMPLATES.some((t) => t.category === c.key)).map((c) => (
        <Card key={c.key}>
          <CardHeader title={c.label} description={c.description} />
          <ul className="divide-y divide-ink-100">
            {TEMPLATES.filter((t) => t.category === c.key).map((t) => {
              const row = rows.get(t.key);
              return (
                <li key={t.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <Link href={`/platform/mail/templates/${t.key}`} className="font-medium text-brand-600 hover:underline">{t.name}</Link>
                    <p className="text-ink-600">{t.description}</p>
                  </div>
                  <div className="flex gap-2">
                    {row && !row.isEnabled && !REQUIRED_TEMPLATES.has(t.key) && <Badge tone="red">switched off</Badge>}
                    <Badge tone={row ? "brand" : "gray"}>{row ? "customised" : "built-in"}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
