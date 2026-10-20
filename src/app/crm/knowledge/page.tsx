import { BookOpen, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { aiConfigured, aiModelLabel } from "@/server/assistant/engine";
import { GUIDE } from "@/server/assistant/guide";
import { HOWTOS } from "@/server/assistant/howtos";
import { PAGES } from "@/server/assistant/sitemap";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { DeleteKnowledgeButton, KnowledgeDialog } from "@/components/assistant/knowledge-controls";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  await requireCentralPage("settings.manage");
  const [entries, pending] = await Promise.all([
    db.knowledgeEntry.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] }),
    db.assistantAction.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  const ai = aiConfigured();
  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Teach the assistant company-specific answers. It already knows how every module of this platform works."
        breadcrumbs={[{ label: "CRM", href: "/crm/dashboard" }, { label: "Knowledge base" }]}
        actions={<KnowledgeDialog />}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="eyebrow">Assistant status</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-ink-900"><Sparkles className={ai ? "h-5 w-5 text-emerald-500" : "h-5 w-5 text-amber-500"} />{ai ? "AI connected" : "AI not connected"}</p>
          <p className="mt-1 text-sm text-ink-500">
            {ai
              ? `Model: ${aiModelLabel()}. Free-form answers, live data lookups and proposed changes are available.`
              : <>Running in built-in guide mode: it answers from the guide and the data with strict rules, but can&apos;t chat freely, answer open-ended questions or propose changes. To connect an AI model, add either <code className="rounded bg-ink-100 px-1 text-xs">ANTHROPIC_API_KEY</code>, or <code className="rounded bg-ink-100 px-1 text-xs">ASSISTANT_PROVIDER=openai-compatible</code> with <code className="rounded bg-ink-100 px-1 text-xs">ASSISTANT_BASE_URL</code>, <code className="rounded bg-ink-100 px-1 text-xs">ASSISTANT_MODEL</code> and <code className="rounded bg-ink-100 px-1 text-xs">ASSISTANT_API_KEY</code> (for example Google Gemini&apos;s free tier), to the server&apos;s <code className="rounded bg-ink-100 px-1 text-xs">.env</code> file, restart the app and run <code className="rounded bg-ink-100 px-1 text-xs">npm run assistant:check</code>.</>}
          </p>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Built-in guide</p>
          <p className="mt-2 text-lg font-semibold text-ink-900">{PAGES.length} screens · {HOWTOS.length} how-tos · {GUIDE.length} topics</p>
          <p className="mt-1 text-sm text-ink-500">Every screen, tab and button of all three workspaces, step-by-step recipes and the concepts behind them — shared with the AI and used by the built-in guide. Maintained with the platform; use your own entries for company policies.</p>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Proposals awaiting confirmation</p>
          <p className="mt-2 text-lg font-semibold text-ink-900">{pending}</p>
          <p className="mt-1 text-sm text-ink-500">Changes the assistant has proposed that users haven&apos;t confirmed yet. Nothing is saved until the user confirms.</p>
        </Card>
      </div>
      <Card>
        <CardHeader title="Your entries" description={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} — active ones are shared with every assistant user`} />
        {entries.length === 0 ? (
          <EmptyState icon={BookOpen} title="No entries yet" description="Add policies, pricing rules, contacts or FAQs the assistant should know — for example your warranty terms or how to escalate a complaint." action={<KnowledgeDialog />} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink-900">{e.title}{!e.isActive && <Badge>Inactive</Badge>}</p>
                  <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-600">{e.body}</p>
                  <p className="mt-1.5 text-xs text-ink-400">Updated {fmtDate(e.updatedAt)}{e.tags.length ? ` · ${e.tags.join(", ")}` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <KnowledgeDialog id={e.id} initial={{ title: e.title, body: e.body, tags: e.tags, isActive: e.isActive }} />
                  <DeleteKnowledgeButton id={e.id} title={e.title} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
