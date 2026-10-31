import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { OpenTicketForm } from "@/components/support/open-ticket-form";
import { STATUS_LABEL, STATUS_TONE } from "@/components/platform/tones";
import { openTicketAction } from "@/server/actions/support";
import { requireCentralPage } from "@/server/authz";
import { platformDb } from "@/server/platform/client";
import { currentTenant } from "@/server/platform/runtime";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await requireCentralPage();
  const tenant = await currentTenant();
  const tickets = await platformDb().supportTicket.findMany({ where: { source: "APP", requesterEmail: user.email.toLowerCase(), ...(tenant.isLegacy ? {} : { tenantId: tenant.id }) }, orderBy: { updatedAt: "desc" }, take: 30 });
  return (
    <>
      <PageHeader title="Support" description="Ask the Velocity team for help. We reply here and by email." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="New request" />
          <div className="p-5"><OpenTicketForm action={openTicketAction} /></div>
        </Card>
        <Card>
          <CardHeader title="Your requests" />
          {tickets.length ? (
            <ul className="divide-y divide-ink-100 text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div><Link href={`/crm/support/${t.id}`} className="font-medium text-brand-600 hover:underline">#{t.number} {t.subject}</Link><p className="text-xs text-ink-500">Updated {fmtDateTime(t.updatedAt)}</p></div>
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={LifeBuoy} title="No requests yet" description="Your conversations with support will appear here." />
          )}
        </Card>
      </div>
    </>
  );
}
