import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { TicketReplyBox } from "@/components/platform/support";
import { STATUS_LABEL, STATUS_TONE } from "@/components/platform/tones";
import { replyToOwnTicketAction } from "@/server/actions/support";
import { requireCentralPage } from "@/server/authz";
import { platformDb } from "@/server/platform/client";
import { currentTenant } from "@/server/platform/runtime";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Support request" };

export default async function MyTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCentralPage();
  const tenant = await currentTenant();
  const { id } = await params;
  // Only the requester's own in-app tickets; internal notes are never loaded.
  const t = await platformDb().supportTicket.findFirst({
    where: { id, source: "APP", requesterEmail: user.email.toLowerCase(), ...(tenant.isLegacy ? {} : { tenantId: tenant.id }) },
    include: { messages: { where: { kind: { in: ["CUSTOMER", "STAFF"] } }, orderBy: { at: "asc" } } },
  });
  if (!t) notFound();
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/crm/support" className="text-brand-600 hover:underline">← Support</Link></p>
      <Card>
        <CardHeader title={`#${t.number} ${t.subject}`} action={<Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>} />
        <ol className="divide-y divide-ink-100">
          {t.messages.map((m) => (
            <li key={m.id} className={`px-5 py-4 ${m.kind === "STAFF" ? "bg-brand-50/60" : ""}`}>
              <p className="mb-1 text-xs text-ink-500"><strong className="text-ink-800">{m.kind === "STAFF" ? `${m.authorName} (support)` : "You"}</strong> · {fmtDateTime(m.at)}</p>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
        {t.status !== "CLOSED" && <div className="border-t border-ink-100 p-5"><TicketReplyBox action={replyToOwnTicketAction.bind(null, t.id)} allowNote={false} label="Add a message" submitLabel="Send" /></div>}
      </Card>
    </>
  );
}
