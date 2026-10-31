import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/misc";
import { TableWrap, withParams } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { loadMailConfig } from "@/server/platform/mail-config";
import { listInbox, mailboxesForRole } from "@/server/platform/mail-inbox";
import { INBOX_TONE } from "@/components/platform/tones";

export const metadata = { title: "Inbox · Mail" };

const STATUSES = ["ALL", "NEW", "OPEN", "RESOLVED", "SPAM"] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ mailbox?: string; status?: string }> }) {
  const admin = await requireAdminPage("mail.manage");
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "NEW";
  const cfg = await loadMailConfig();
  const allowed = mailboxesForRole(admin.role);
  const boxes = cfg.mailboxes.filter((m) => m.receives && (allowed === "all" || allowed.includes(m.key)));
  const rows = await listInbox(admin.role, { mailbox: sp.mailbox, status });
  const params = { mailbox: sp.mailbox, status: sp.status };
  const pill = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:text-ink-900"}`;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={withParams("/platform/mail", params, { mailbox: undefined })} className={pill(!sp.mailbox)}>All mailboxes</Link>
        {boxes.map((m) => <Link key={m.key} href={withParams("/platform/mail", params, { mailbox: m.key })} className={pill(sp.mailbox === m.key)}>{m.address}</Link>)}
        <span className="mx-2 h-5 w-px bg-ink-200" aria-hidden />
        {STATUSES.map((s) => <Link key={s} href={withParams("/platform/mail", params, { status: s })} className={pill(status === s)}>{s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}</Link>)}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No messages here" description={status === "NEW" ? "New mail sent to support@ or billing@ appears here as soon as it arrives. If you expect mail and see none, check Mailboxes & setup for the inbound steps." : "Nothing matches this filter."} />
      ) : (
        <TableWrap>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">From</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">To</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Received</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-sm">
            {rows.map((m) => (
              <tr key={m.id} className={m.readAt ? "" : "font-semibold"}>
                <td className="px-4 py-2.5"><Link className="hover:underline" href={`/platform/mail/${m.id}`}>{m.fromName ? `${m.fromName} ` : ""}<span className={m.fromName ? "font-normal text-ink-500" : ""}>{m.fromName ? `<${m.fromAddress}>` : m.fromAddress}</span></Link></td>
                <td className="px-4 py-2.5"><Link className="hover:underline" href={`/platform/mail/${m.id}`}>{m.subject}</Link></td>
                <td className="px-4 py-2.5 font-normal text-ink-600">{m.mailboxKey}</td>
                <td className="px-4 py-2.5"><Badge tone={INBOX_TONE[m.inboxStatus ?? "NEW"]}>{(m.inboxStatus ?? "NEW").toLowerCase()}</Badge></td>
                <td className="px-4 py-2.5 font-normal text-ink-600">{fmtDateTime(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
