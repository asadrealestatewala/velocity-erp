import { BookOpen, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireCentralPage } from "@/server/authz";
import { aiConfigured } from "@/server/assistant/engine";
import { GUIDE } from "@/server/assistant/guide";
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
          <p className="mt-1 text-sm text-ink-500">{ai ? `Model: ${process.env.ASSISTANT_MODEL || "claude-opus-5-5"}. Answers, live data lookups and proposed changes are available.` : "Set ANTHROPIC_API_KEY on the server to enable full answers, live data lookups and proposed changes. Until then users get matching help topics only."}</p>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Built-in guide</p>
          <p className="mt-2 text-lg font-semibold text-ink-900">{GUIDE.length} topics</p>
          <p className="mt-1 text-sm text-ink-500">Covers every module: contacts, pipeline, forms, inventory, orders, procurement, ledger, vouchers, documents, chat and more. Maintained with the platform.</p>
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
