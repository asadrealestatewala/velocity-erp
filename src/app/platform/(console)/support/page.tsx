import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { FilterTabs, SearchBox } from "@/components/platform/list";
import { SavedViews } from "@/components/platform/saved-views";
import { ActionForm } from "@/components/platform/console";
import { createTicketAction } from "@/server/actions/platform-support";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { slaState, TICKET_OPEN } from "@/server/platform/tickets";
import { fmtDateTime } from "@/lib/utils";
import { PRIORITY_TONE, SLA_LABEL, SLA_TONE, STATUS_LABEL, STATUS_TONE } from "@/components/platform/tones";

export const metadata = { title: "Support tickets" };

const VIEWS = [{ key: "open", label: "Open" }, { key: "mine", label: "Assigned to me" }, { key: "unassigned", label: "Unassigned" }, { key: "overdue", label: "Overdue" }, { key: "done", label: "Resolved & closed" }];

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const me = await requireAdminPage("support.manage");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "open";
  const q = sp.q?.trim() || undefined;
  const now = new Date();
  const num = q && /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  const search = q ? { OR: [{ subject: { contains: q, mode: "insensitive" as const } }, { requesterEmail: { contains: q, mode: "insensitive" as const } }, { tenant: { is: { name: { contains: q, mode: "insensitive" as const } } } }, ...(num !== null ? [{ number: num }] : [])] } : {};
  const whereFor = (v: string) =>
    v === "mine" ? { status: { in: TICKET_OPEN }, assigneeId: me.id }
    : v === "unassigned" ? { status: { in: TICKET_OPEN }, assigneeId: null }
    : v === "overdue" ? { status: { in: TICKET_OPEN }, firstResponseAt: null, firstResponseDueAt: { lt: now } }
    : v === "done" ? { status: { in: ["RESOLVED", "CLOSED"] as ("RESOLVED" | "CLOSED")[] } }
    : { status: { in: TICKET_OPEN } };
  const db = platformDb();
  const [tickets, counts] = await Promise.all([
    db.supportTicket.findMany({ where: { ...whereFor(view), ...search }, orderBy: view === "done" ? { updatedAt: "desc" } : [{ firstResponseDueAt: "asc" }], take: 100, include: { tenant: { select: { name: true, slug: true } } } }),
    Promise.all(VIEWS.map((v) => db.supportTicket.count({ where: { ...whereFor(v.key), ...search } }))),
  ]);
  const href = (v: string) => `/platform/support?${new URLSearchParams({ view: v, ...(q ? { q } : {}) })}`;
  return (
    <>
      <PageHeader title="Support tickets" description="Customer problems with an owner and a first-reply deadline (urgent 4 h, high 8 h, normal 24 h, low 72 h)." />
      <FilterTabs label="Ticket views" active={view} tabs={VIEWS.map((v, i) => ({ key: v.key, label: v.label, count: counts[i], href: href(v.key) }))} />
      <SearchBox id="ticket-q" label="Search" action="/platform/support" q={q} placeholder="Subject, customer, email or ticket number" keep={{ view }} clearHref={href(view)} />
      <SavedViews storageKey="support" />
      <TableWrap>
        <thead><tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Priority</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">First reply</th><th className="px-4 py-2.5">Owner</th></tr></thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {tickets.map((t) => {
            const sla = slaState(t, now);
            return (
              <tr key={t.id}>
                <td className="px-4 py-2.5">{t.number}</td>
                <td className="px-4 py-2.5"><Link className="font-medium text-brand-600 hover:underline" href={`/platform/support/${t.id}`}>{t.subject}</Link><div className="text-xs text-ink-500">{fmtDateTime(t.createdAt)} · {t.source.toLowerCase()}</div></td>
                <td className="px-4 py-2.5">{t.tenant?.name ?? t.requesterEmail ?? "—"}</td>
                <td className="px-4 py-2.5"><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority.toLowerCase()}</Badge></td>
                <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                <td className="px-4 py-2.5"><Badge tone={SLA_TONE[sla]}>{SLA_LABEL[sla]}</Badge>{sla === "ok" || sla === "due_soon" || sla === "overdue" ? <div className="text-xs text-ink-500">by {fmtDateTime(t.firstResponseDueAt)}</div> : null}</td>
                <td className="px-4 py-2.5">{t.assigneeName ?? <span className="text-ink-400">unassigned</span>}</td>
              </tr>
            );
          })}
          {!tickets.length && <tr><td colSpan={7}><EmptyState icon={LifeBuoy} title={q ? "No tickets match this search" : "No tickets here"} description={q ? "Try a different word or check another view." : view === "open" ? "Every customer question has been answered. New tickets appear here." : "Nothing in this view right now."} action={q ? <Link href={href(view)} className="link text-sm">Clear search</Link> : undefined} /></td></tr>}
        </tbody>
      </TableWrap>
      <Card className="mt-6">
        <CardHeader title="New ticket" description="For problems that arrive by phone or WhatsApp. Emails can be turned into tickets from the Mail inbox, and customers can open tickets themselves from Support in their workspace." />
        <div className="p-5">
          <ActionForm
            submitLabel="Create ticket"
            reset
            action={createTicketAction}
            fields={[
              { name: "subject", label: "Subject" },
              { name: "body", label: "What happened", type: "textarea" },
              { name: "tenantCode", label: "Workspace code (optional)", optional: true },
              { name: "requesterEmail", label: "Customer email (optional)", optional: true },
              { name: "priority", label: "Priority", type: "select", options: [{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }], defaultValue: "NORMAL" },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
