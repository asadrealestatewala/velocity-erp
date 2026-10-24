import Link from "next/link";
import type { Prisma } from "@/generated/platform";
import { Badge, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { platformDb } from "@/server/platform/client";
import { SUB_TONE } from "@/components/platform/tones";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Workspaces" };

const SUBS = Object.keys(SUB_TONE);

export default async function Workspaces({ searchParams }: { searchParams: Promise<{ q?: string; sub?: string }> }) {
  await requireAdminPage("tenants.view");
  const { q, sub } = await searchParams;
  const where: Prisma.TenantWhereInput = {
    ...(sub && SUBS.includes(sub) ? { subStatus: sub as keyof typeof SUB_TONE } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { ownerEmail: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const rows = await platformDb().tenant.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Workspaces" description="Every company on the platform." />
      <form className="mb-4 flex flex-wrap gap-2" action="/platform/workspaces">
        <input name="q" defaultValue={q} placeholder="Search name, code or owner email" className="input max-w-xs" />
        <select name="sub" defaultValue={sub ?? ""} className="input max-w-[11rem]">
          <option value="">All statuses</option>
          {SUBS.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>
      <TableWrap>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-ink-500">
            <th className="px-4 py-2.5">Company</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Ends</th><th className="px-4 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 text-sm">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5"><Link href={`/platform/workspaces/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.name}</Link><div className="text-xs text-ink-500">{t.slug}{t.isLegacy ? " · original" : ""}{t.status !== "ACTIVE" ? ` · ${t.status.toLowerCase()}` : ""}</div></td>
              <td className="px-4 py-2.5">{t.ownerEmail ?? "—"}</td>
              <td className="px-4 py-2.5 capitalize">{t.planKey ?? "—"}</td>
              <td className="px-4 py-2.5"><Badge tone={SUB_TONE[t.subStatus]}>{t.subStatus.toLowerCase().replace("_", " ")}</Badge></td>
              <td className="px-4 py-2.5">{fmtDate(t.subStatus === "TRIALING" ? t.trialEndsAt : t.currentPeriodEnd)}</td>
              <td className="px-4 py-2.5">{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No workspaces match.</td></tr>}
        </tbody>
      </TableWrap>
    </>
  );
}
