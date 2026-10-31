import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { TicketReplyBox } from "@/components/platform/support";
import { PRIORITY_TONE, SLA_LABEL, SLA_TONE, STATUS_LABEL, STATUS_TONE } from "@/components/platform/tones";
import { ticketReplyAction, updateTicketAction } from "@/server/actions/platform-support";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { slaState } from "@/server/platform/tickets";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Ticket" };

const KIND_STYLE = { CUSTOMER: "bg-white", STAFF: "bg-brand-50/60", NOTE: "bg-amber-50" } as const;
const KIND_LABEL = { CUSTOMER: "Customer", STAFF: "Reply sent", NOTE: "Internal note" } as const;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdminPage("support.manage");
  const { id } = await params;
  const t = await platformDb().supportTicket.findUnique({ where: { id }, include: { tenant: true, messages: { orderBy: { at: "asc" } } } });
  if (!t) notFound();
  const [staff, mail] = await Promise.all([
    platformDb().platformAdmin.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    t.mailThreadKey ? platformDb().mailMessage.findFirst({ where: { threadKey: t.mailThreadKey, direction: "INBOUND" }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null,
  ]);
  const sla = slaState(t);
  const open = t.status === "OPEN" || t.status === "WAITING_CUSTOMER";
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/platform/support" className="text-brand-600 hover:underline">← Tickets</Link></p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`#${t.number} · ${t.subject}`} description={<>Opened {fmtDateTime(t.createdAt)} via {t.source.toLowerCase()}{t.requesterEmail ? <> by {t.requesterName ? `${t.requesterName} ` : ""}&lt;{t.requesterEmail}&gt;</> : null}</>} />
            <ol className="divide-y divide-ink-100">
              {t.messages.map((m) => (
                <li key={m.id} className={`px-5 py-4 ${KIND_STYLE[m.kind]}`}>
                  <p className="mb-1 text-xs text-ink-500"><strong className="text-ink-800">{m.authorName}</strong> · {KIND_LABEL[m.kind]} · {fmtDateTime(m.at)}</p>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <div className="p-5"><TicketReplyBox action={ticketReplyAction.bind(null, t.id)} label={`Reply to ${t.requesterName ?? t.requesterEmail ?? "the customer"}`} /></div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><dt>Status</dt><dd><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge></dd></div>
              <div className="flex justify-between"><dt>Priority</dt><dd><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority.toLowerCase()}</Badge></dd></div>
              <div className="flex justify-between"><dt>First reply</dt><dd><Badge tone={SLA_TONE[sla]}>{SLA_LABEL[sla]}</Badge></dd></div>
              <div className="flex justify-between"><dt>Due</dt><dd>{fmtDateTime(t.firstResponseDueAt)}</dd></div>
              <div className="flex justify-between"><dt>Owner</dt><dd>{t.assigneeName ?? "unassigned"}</dd></div>
              <div className="flex justify-between"><dt>Workspace</dt><dd>{t.tenant ? <Link className="text-brand-600 hover:underline" href={`/platform/workspaces/${t.tenant.id}`}>{t.tenant.name}</Link> : "—"}</dd></div>
              {mail && <div className="flex justify-between"><dt>Email thread</dt><dd><Link className="text-brand-600 hover:underline" href={`/platform/mail/${mail.id}`}>Open</Link></dd></div>}
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-ink-100 p-4">
              {open ? <RunButton label="Mark resolved" variant="primary" action={updateTicketAction.bind(null, t.id, { status: "RESOLVED" })} /> : <RunButton label="Reopen" action={updateTicketAction.bind(null, t.id, { status: "OPEN" })} />}
              {t.status !== "CLOSED" && <RunButton label="Close" variant="ghost" action={updateTicketAction.bind(null, t.id, { status: "CLOSED" })} />}
              {t.assigneeId !== me.id && <RunButton label="Assign to me" variant="ghost" action={updateTicketAction.bind(null, t.id, { assignTo: me.id })} />}
            </div>
          </Card>
          <Card>
            <CardHeader title="Change" />
            <div className="p-5">
              <ActionForm
                action={updateTicketAction.bind(null, t.id)}
                fields={[
                  { name: "priority", label: "Priority", type: "select", options: [{ value: "LOW", label: "Low (72 h)" }, { value: "NORMAL", label: "Normal (24 h)" }, { value: "HIGH", label: "High (8 h)" }, { value: "URGENT", label: "Urgent (4 h)" }], defaultValue: t.priority },
                  { name: "assignTo", label: "Owner", type: "select", options: [{ value: "", label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.name }))], defaultValue: t.assigneeId ?? "", optional: true },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
