import Link from "next/link";
import { Send } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { DELIVERY_TONE } from "@/components/platform/tones";
import { fmtDateTime } from "@/lib/utils";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { listSent } from "@/server/platform/mail-inbox";
import { mailConfigured } from "@/server/platform/mail";

export const metadata = { title: "Sent log · Mail" };

export default async function SentPage() {
  const admin = await requireAdminPage("mail.manage");
  const rows = await listSent({ role: admin.role, take: 200 });
  return (
    <>
      {!mailConfigured() && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No mail provider is configured on the server (RESEND_API_KEY), so messages are logged here as “not sent”.</p>}
      {rows.length === 0 ? (
        <EmptyState icon={Send} title="Nothing sent yet" description="Every email the platform sends — invitations, receipts, resets, replies — is listed here with its delivery status." />
      ) : (
        <TableWrap>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-ink-500"><th className="px-4 py-2.5">To</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">From</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Sent</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-sm">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5">{m.toAddress}</td>
                <td className="px-4 py-2.5">{m.subject}{m.sentByEmail && <div className="text-xs text-ink-500">by {m.sentByEmail}</div>}</td>
                <td className="px-4 py-2.5 text-ink-600">{m.fromAddress}</td>
                <td className="px-4 py-2.5 text-ink-600">{m.templateKey ?? m.category ?? "—"}</td>
                <td className="px-4 py-2.5">{m.delivery ? <Badge tone={DELIVERY_TONE[m.delivery]}>{m.delivery.toLowerCase().replace("_", " ")}</Badge> : "—"}{m.deliveryDetail && <div className="max-w-xs text-xs text-ink-500">{m.deliveryDetail}</div>}</td>
                <td className="px-4 py-2.5 text-ink-600">{fmtDateTime(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="mt-3 text-xs text-ink-500">Messages that contain a one-time link (password resets, confirmations, invitations) are logged without their body. Status updates arrive from Resend through the webhook; see <Link className="text-brand-600 hover:underline" href="/platform/mail/mailboxes">Mailboxes &amp; setup</Link>.</p>
    </>
  );
}
