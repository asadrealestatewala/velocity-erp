import Link from "next/link";
import { Users } from "lucide-react";
import type { CurrentUser } from "@/server/auth/session";
import { can, isCentral, managedDealershipIds } from "@/server/authz";
import type { listContacts } from "@/server/queries/contacts";
import { Avatar, Badge, EmptyState, StageBadge } from "@/components/ui/misc";
import { Pagination, SortHeader, TableWrap } from "@/components/ui/table";
import { ButtonLink } from "@/components/ui/button";
import { fmtDateTime, fmtRelative, fullName } from "@/lib/utils";
import { ORIGIN_LABEL } from "@/lib/constants";
import { ContactRowActions } from "./row-actions";

type Rows = Awaited<ReturnType<typeof listContacts>>["rows"];

export function ContactsTable({
  user,
  rows,
  total,
  page,
  pageSize,
  base,
  params,
}: {
  user: CurrentUser;
  rows: Rows;
  total: number;
  page: number;
  pageSize: number;
  base: string;
  params: Record<string, string | undefined>;
}) {
  const listBase = `${base}/contacts`;
  const managed = managedDealershipIds(user);
  if (!rows.length)
    return (
      <div className="card">
        <EmptyState
          icon={Users}
          title="No contacts match these filters"
          description="Try clearing some filters, or add a new contact."
          action={can(user, "contacts.create") ? <ButtonLink href={isCentral(user) ? `${base}/contacts/new` : `${base}/leads/new`}>Add contact</ButtonLink> : undefined}
        />
      </div>
    );
  return (
    <>
      {/* Desktop / tablet table */}
      <TableWrap className="hidden md:block" footer={<Pagination base={listBase} params={params} page={page} pageSize={pageSize} total={total} />}>
        <thead className="bg-ink-50/60">
          <tr>
            <SortHeader label="Contact" field="name" base={listBase} params={params} />
            <th className="th">Phone</th>
            <th className="th">Email</th>
            <SortHeader label="Type" field="type" base={listBase} params={params} />
            <th className="th">Source</th>
            <th className="th">Stage</th>
            <SortHeader label="City" field="city" base={listBase} params={params} />
            <th className="th">Dealership</th>
            <SortHeader label="Created" field="created" base={listBase} params={params} />
            <SortHeader label="Recent activity" field="activity" base={listBase} params={params} />
            <th className="th">Sales rep</th>
            <th className="th sr-only">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {rows.map((c) => {
            const lead = c.leads[0] ?? null;
            const assignMode = lead
              ? isCentral(user)
                ? can(user, "leads.assign") ? ("central" as const) : null
                : can(user, "leads.assign_team") && lead.dealership && managed.includes(lead.dealership.id) ? ("team" as const) : null
              : null;
            return (
              <tr key={c.id} className="hover:bg-ink-50/50">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <Avatar name={fullName(c)} src={c.avatarFile ? `/api/files/${c.avatarFile.id}` : null} size={34} />
                    <div className="min-w-0">
                      <Link href={`${listBase}/${c.id}`} className="link block max-w-[180px] truncate">{fullName(c)}</Link>
                      {c.businessName && <p className="max-w-[180px] truncate text-xs text-ink-400">{c.businessName}</p>}
                    </div>
                  </div>
                </td>
                <td className="td whitespace-nowrap tabular-nums">{c.phone ?? "—"}</td>
                <td className="td max-w-[180px] truncate">{c.email ?? "—"}</td>
                <td className="td"><Badge tone={c.type === "CUSTOMER" ? "green" : "gray"}>{c.type === "CUSTOMER" ? "Customer" : "Lead"}</Badge></td>
                <td className="td whitespace-nowrap">{c.source?.name ?? "—"}</td>
                <td className="td">{lead ? <StageBadge name={lead.stage.name} color={lead.stage.color} /> : "—"}</td>
                <td className="td whitespace-nowrap">{c.city?.name ?? "—"}</td>
                <td className="td">
                  {lead?.dealership ? (
                    <div className="max-w-[160px]">
                      <p className="truncate">{lead.dealership.name}</p>
                      <p className="text-xs text-ink-400">{ORIGIN_LABEL[lead.origin]}</p>
                    </div>
                  ) : lead ? <Badge tone="red">Unassigned</Badge> : "—"}
                </td>
                <td className="td whitespace-nowrap text-xs">{fmtDateTime(c.createdAt)}</td>
                <td className="td whitespace-nowrap text-xs">{fmtRelative(c.lastActivityAt)}</td>
                <td className="td whitespace-nowrap">{lead?.assignedUser?.name ?? "—"}</td>
                <td className="td text-right">
                  <ContactRowActions
                    contactId={c.id}
                    base={base}
                    archived={c.isArchived}
                    lead={lead ? { id: lead.id, dealershipId: lead.dealership?.id ?? null, userId: lead.assignedUser?.id ?? null } : null}
                    can={{ edit: can(user, "contacts.edit"), assign: assignMode, followUp: can(user, "tasks.manage"), archive: can(user, "contacts.archive") }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((c) => {
          const lead = c.leads[0];
          return (
            <li key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <Avatar name={fullName(c)} src={c.avatarFile ? `/api/files/${c.avatarFile.id}` : null} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`${listBase}/${c.id}`} className="link block truncate">{fullName(c)}</Link>
                  <p className="truncate text-sm text-ink-500">{c.phone ?? c.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lead && <StageBadge name={lead.stage.name} color={lead.stage.color} />}
                    <Badge tone={c.type === "CUSTOMER" ? "green" : "gray"}>{c.type === "CUSTOMER" ? "Customer" : "Lead"}</Badge>
                    {lead && <Badge tone="gray">{lead.dealership?.name ?? "Unassigned"}</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-ink-400">{c.city?.name ?? "No city"} · {c.source?.name ?? "—"} · {fmtRelative(c.createdAt)}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="card mt-3 overflow-hidden md:hidden">
        <Pagination base={listBase} params={params} page={page} pageSize={pageSize} total={total} />
      </div>
    </>
  );
}
