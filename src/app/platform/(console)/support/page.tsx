import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { ActionForm } from "@/components/platform/console";
import { createTicketAction } from "@/server/actions/platform-support";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { slaState, TICKET_OPEN } from "@/server/platform/tickets";
import { fmtDateTime } from "@/lib/utils";
import { PRIORITY_TONE, SLA_LABEL, SLA_TONE, STATUS_LABEL, STATUS_TONE } from "@/components/platform/tones";

export const metadata = { title: "Support tickets" };

const VIEWS = [{ key: "open", label: "Open" }, { key: "mine", label: "Assigned to me" }, { key: "unassigned", label: "Unassigned" }, { key: "overdue", label: "Overdue" }, { key: "done", label: "Resolved & closed" }];

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const me = await requireAdminPage("support.manage");
  const view = (await searchParams).view ?? "open";
  const now = new Date();
  const where =
    view === "mine" ? { status: { in: TICKET_OPEN }, assigneeId: me.id }
    : view === "unassigned" ? { status: { in: TICKET_OPEN }, assigneeId: null }
    : view === "overdue" ? { status: { in: TICKET_OPEN }, firstResponseAt: null, firstResponseDueAt: { lt: now } }
    : view === "done" ? { status: { in: ["RESOLVED", "CLOSED"] as ("RESOLVED" | "CLOSED")[] } }
    : { status: { in: TICKET_OPEN } };
  const tickets = await platformDb().supportTicket.findMany({ where, orderBy: view === "done" ? { updatedAt: "desc" } : [{ firstResponseDueAt: "asc" }], take: 100, include: { tenant: { select: { name: true, slug: true } } } });
  return (
    <>
      <PageHeader title="Support tickets" description="Customer problems with an owner and a first-reply deadline (urgent 4 h, high 8 h, normal 24 h, low 72 h)." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Ticket views">
        {VIEWS.map((v) => <Link key={v.key} href={`/platform/support?view=${v.key}`} className={`rounded-full px-3 py-1 ${view === v.key ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"}`}>{v.label}</Link>)}
      </nav>
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
          {!tickets.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-500">No tickets here.</td></tr>}
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
