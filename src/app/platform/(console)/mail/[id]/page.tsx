import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { ReplyBox } from "@/components/platform/mail";
import { RunButton } from "@/components/platform/console";
import { DELIVERY_TONE, INBOX_TONE } from "@/components/platform/tones";
import { fmtDateTime } from "@/lib/utils";
import { ticketFromMailAction } from "@/server/actions/platform-support";
import { replyAction, setInboxStatusAction } from "@/server/actions/platform-mail";
import { adminCan, requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { getThread, markRead } from "@/server/platform/mail-inbox";

export const metadata = { title: "Message · Mail" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage("mail.manage");
  const { id } = await params;
  const found = await getThread(id, admin.role);
  if (!found || found.message.direction !== "INBOUND") notFound();
  const { message, thread } = found;
  await markRead(message.id);
  const tenant = message.tenantId ? await platformDb().tenant.findUnique({ where: { id: message.tenantId }, select: { id: true, name: true, slug: true } }) : null;
  const status = message.inboxStatus ?? "NEW";
  const ticket = await platformDb().supportTicket.findFirst({ where: { mailThreadKey: message.threadKey }, select: { id: true, number: true } });
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/platform/mail" className="text-brand-600 hover:underline">← Inbox</Link></p>
      <Card>
        <CardHeader
          title={message.subject}
          description={<>From {message.fromName ? `${message.fromName} ` : ""}&lt;{message.fromAddress}&gt; to {message.toAddress}{tenant ? <> · customer <Link className="text-brand-600 hover:underline" href={`/platform/workspaces/${tenant.id}`}>{tenant.name}</Link></> : null}</>}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={INBOX_TONE[status]}>{status.toLowerCase()}</Badge>
              {ticket ? <Link className="text-sm text-brand-600 hover:underline" href={`/platform/support/${ticket.id}`}>Ticket #{ticket.number}</Link> : adminCan(admin.role, "support.manage") && <RunButton label="Create ticket" action={ticketFromMailAction.bind(null, message.id)} />}
              {status !== "RESOLVED" && <RunButton label="Mark resolved" action={setInboxStatusAction.bind(null, message.id, { status: "RESOLVED" })} />}
              {status === "RESOLVED" && <RunButton label="Reopen" action={setInboxStatusAction.bind(null, message.id, { status: "OPEN" })} />}
              {status !== "SPAM" && <RunButton label="Spam" variant="ghost" action={setInboxStatusAction.bind(null, message.id, { status: "SPAM" })} />}
            </div>
          }
        />
        <ol className="divide-y divide-ink-100">
          {thread.map((m) => (
            <li key={m.id} className="px-5 py-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                <span>{m.direction === "INBOUND" ? `${m.fromName ?? m.fromAddress} wrote` : `${m.sentByEmail ?? "Staff"} replied from ${m.fromAddress}`} · {fmtDateTime(m.createdAt)}</span>
                {m.direction === "OUTBOUND" && m.delivery && <Badge tone={DELIVERY_TONE[m.delivery]}>{m.delivery.toLowerCase().replace("_", " ")}</Badge>}
              </div>
              {/* Plain text only: received mail is untrusted and is never rendered as HTML. */}
              <pre className="font-sans text-sm whitespace-pre-wrap break-words text-ink-800">{m.bodyText}</pre>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="mt-4">
        <div className="p-5"><ReplyBox action={replyAction.bind(null, message.id)} toLabel={message.fromAddress} /></div>
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">Sent from {message.mailboxKey}@ identity with your mailbox signature, threaded under this message.</p>
      </Card>
    </>
  );
}
