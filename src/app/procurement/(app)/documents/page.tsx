import Link from "next/link";
import { Award, FileBadge2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireProcurementPage } from "@/server/authz";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { DEALER_DOC_CATEGORY } from "@/lib/ops-constants";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Documents & certificates" };

export default async function DocumentsOverviewPage() {
  await requireProcurementPage("dealerdocs.admin");
  const [dealers, recent] = await Promise.all([
    db.dealership.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true,
        dealerDocuments: { where: { deletedAt: null }, select: { category: true, expiresAt: true } },
      },
    }),
    db.dealershipDocument.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, include: { dealership: { select: { id: true, name: true } }, uploadedBy: { select: { name: true } } } }),
  ]);
  const today = new Date(new Date().toDateString());
  return (
    <>
      <PageHeader title="Documents & certificates" description="Each dealership's registration papers, and the achievement certificates YADEA has issued. Open a dealership to upload or issue documents." breadcrumbs={[{ label: "Procurement", href: "/procurement/dashboard" }, { label: "Documents" }]} />
      <Card className="mb-6">
        <CardHeader title="Document status by dealership" />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-ink-50/60"><tr><th className="th">Dealership</th><th className="th">Registration certificate</th><th className="th text-right">Documents</th><th className="th text-right">Certificates issued</th><th className="th">Expiring / expired</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {dealers.map((d) => {
                const hasReg = d.dealerDocuments.some((x) => x.category === "REGISTRATION_CERTIFICATE");
                const certs = d.dealerDocuments.filter((x) => x.category === "ACHIEVEMENT_CERTIFICATE").length;
                const expired = d.dealerDocuments.filter((x) => x.expiresAt && x.expiresAt < today).length;
                const soon = d.dealerDocuments.filter((x) => x.expiresAt && x.expiresAt >= today && x.expiresAt.getTime() - today.getTime() < 30 * 86400_000).length;
                return (
                  <tr key={d.id} className="hover:bg-ink-50/50">
                    <td className="td"><Link href={`/procurement/dealers/${d.id}?tab=documents`} className="link">{d.name}</Link></td>
                    <td className="td">{hasReg ? <Badge tone="green">On file</Badge> : <Badge tone="amber">Missing</Badge>}</td>
                    <td className="td text-right tabular-nums">{d.dealerDocuments.length - certs}</td>
                    <td className="td text-right tabular-nums">{certs}</td>
                    <td className="td text-sm">{expired ? <Badge tone="red">{expired} expired</Badge> : null} {soon ? <Badge tone="amber">{soon} expiring soon</Badge> : null}{!expired && !soon && <span className="text-ink-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Recently added" />
        {recent.length === 0 ? (
          <EmptyState icon={FileBadge2} title="No documents yet" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  {d.category === "ACHIEVEMENT_CERTIFICATE" ? <Award className="h-5 w-5 shrink-0 text-accent-500" /> : <FileBadge2 className="h-5 w-5 shrink-0 text-brand-500" />}
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink-900">{d.title}</span><span className="block text-xs text-ink-500">{d.dealership.name} · {DEALER_DOC_CATEGORY[d.category]} · {d.source === "YADEA" ? "Issued by YADEA" : "Uploaded by dealer"} · {fmtDate(d.createdAt)}</span></span>
                </span>
                <a href={`/api/files/${d.fileId}?download=1`} className="text-sm font-medium text-brand-700 hover:underline">Download</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
