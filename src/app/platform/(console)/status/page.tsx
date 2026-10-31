import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ActionForm, RunButton } from "@/components/platform/console";
import { postIncidentAction, resolveIncidentAction } from "@/server/actions/platform-status";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Status page" };

export default async function StatusAdminPage() {
  await requireAdminPage("status.manage");
  const rows = await platformDb().statusIncident.findMany({ orderBy: { startedAt: "desc" }, take: 30 });
  return (
    <>
      <PageHeader title="Status page" description="What customers see at /status. The page checks the database and maintenance mode by itself; use this to tell customers about anything else that is wrong." actions={<Link className="link text-sm" href="/status" target="_blank">Open public page ↗</Link>} />
      <Card>
        <ul className="divide-y divide-ink-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.title} <Badge tone={r.impact === "major" ? "red" : "amber"}>{r.impact}</Badge> {r.resolvedAt ? <Badge tone="green">resolved</Badge> : <Badge tone="red">open</Badge>}</p>
                <p className="whitespace-pre-line text-ink-600">{r.body}</p>
                <p className="text-xs text-ink-500">Since {fmtDateTime(r.startedAt)}{r.resolvedAt ? `, resolved ${fmtDateTime(r.resolvedAt)}` : ""} · by {r.createdBy ?? "?"}</p>
              </div>
              {!r.resolvedAt && <RunButton label="Mark resolved" variant="ghost" action={resolveIncidentAction.bind(null, r.id)} />}
            </li>
          ))}
          {!rows.length && <li className="px-5 py-4 text-ink-500">No incidents posted.</li>}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Report an incident" description="Appears on the public page straight away. Write what customers will notice, not the technical cause." />
        <div className="p-5">
          <ActionForm
            submitLabel="Post incident"
            reset
            action={postIncidentAction}
            fields={[
              { name: "title", label: "Title", placeholder: "Card payments are failing" },
              { name: "body", label: "What customers will notice", type: "textarea" },
              { name: "impact", label: "Impact", type: "select", options: [{ value: "minor", label: "Minor: some things are slow or limited" }, { value: "major", label: "Major: customers cannot do something important" }], defaultValue: "minor" },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
