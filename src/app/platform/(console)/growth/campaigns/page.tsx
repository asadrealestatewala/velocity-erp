import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, ReasonButton, RunButton } from "@/components/platform/console";
import { deleteCampaignDraftAction, saveCampaignAction, sendCampaignAction } from "@/server/actions/platform-growth";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { SEGMENTS, segmentMembers, type Segment } from "@/server/platform/campaigns";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Email campaigns" };

export default async function CampaignsPage() {
  await requireAdminPage("campaigns.send");
  const rows = await platformDb().campaign.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const counts = Object.fromEntries(await Promise.all((Object.keys(SEGMENTS) as Segment[]).map(async (s) => [s, (await segmentMembers(s)).length] as const)));
  return (
    <>
      <PageHeader title="Email campaigns" description="One-off product emails to a group of workspace owners. Anyone who unsubscribes is skipped from then on. Account and billing emails are not affected." actions={<Link className="link text-sm" href="/platform/growth">← Growth</Link>} />
      <Card>
        <ul className="divide-y divide-ink-100 text-sm">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name} {c.sentAt ? <Badge tone="green">sent</Badge> : <Badge tone="gray">draft</Badge>}</p>
                <p className="text-ink-600">“{c.subject}” to {SEGMENTS[c.segment as Segment] ?? c.segment}</p>
                <p className="text-xs text-ink-500">{c.sentAt ? `Sent ${fmtDateTime(c.sentAt)} · ${c.delivered} delivered, ${c.failed} failed of ${c.recipients}` : `Would reach ${counts[c.segment] ?? 0} workspace(s) right now`} · by {c.createdBy}</p>
              </div>
              {!c.sentAt && (
                <div className="flex gap-2">
                  <RunButton label="Delete" variant="ghost" action={deleteCampaignDraftAction.bind(null, c.id)} />
                  <ReasonButton label={`Send to ${counts[c.segment] ?? 0}`} title="Send this campaign?" description={`“${c.subject}” will be emailed to ${counts[c.segment] ?? 0} workspace owner(s). This cannot be undone.`} withReason={false} confirmLabel="Send now" variant="primary" action={sendCampaignAction.bind(null, c.id)} />
                </div>
              )}
            </li>
          ))}
          {!rows.length && <li className="px-5 py-4 text-ink-500">No campaigns yet.</li>}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="New draft" description="Use {{name}} for the owner's first name and {{company}} for the workspace name. Saving does not send anything." />
        <div className="p-5">
          <ActionForm
            submitLabel="Save draft"
            reset
            action={saveCampaignAction}
            fields={[
              { name: "name", label: "Internal name", placeholder: "November feature update" },
              { name: "segment", label: "Send to", type: "select", options: (Object.keys(SEGMENTS) as Segment[]).map((s) => ({ value: s, label: `${SEGMENTS[s]} (${counts[s]})` })), defaultValue: "active" },
              { name: "subject", label: "Subject" },
              { name: "body", label: "Message (blank line = new paragraph)", type: "textarea" },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
