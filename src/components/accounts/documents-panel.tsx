import { Award, Download, FileBadge2, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { DeleteDocumentButton, UploadDocumentDialog } from "@/components/accounts/document-dialogs";
import { DEALER_DOC_CATEGORY } from "@/lib/ops-constants";
import { fmtDate } from "@/lib/utils";

type Category = keyof typeof DEALER_DOC_CATEGORY;
const DEALER_UPLOADABLE: Category[] = ["REGISTRATION_CERTIFICATE", "BUSINESS_LICENSE", "TAX_REGISTRATION", "AGREEMENT", "OTHER"];
const ALL: Category[] = ["REGISTRATION_CERTIFICATE", "BUSINESS_LICENSE", "TAX_REGISTRATION", "AGREEMENT", "ACHIEVEMENT_CERTIFICATE", "OTHER"];

/** The shared document list for one dealership. The dealership and YADEA see exactly the same documents. */
export async function DocumentsPanel({ dealershipId, dealershipName, mode, canUpload }: { dealershipId: string; dealershipName: string; mode: "dealer" | "central"; canUpload: boolean }) {
  const docs = await db.dealershipDocument.findMany({
    where: { dealershipId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { file: { select: { originalName: true, size: true, mimeType: true } }, uploadedBy: { select: { name: true } } },
  });
  const certificates = docs.filter((d) => d.category === "ACHIEVEMENT_CERTIFICATE");
  const others = docs.filter((d) => d.category !== "ACHIEVEMENT_CERTIFICATE");
  const hasRegistration = docs.some((d) => d.category === "REGISTRATION_CERTIFICATE");
  const today = new Date(new Date().toDateString());

  const row = (d: (typeof docs)[number]) => {
    const expired = d.expiresAt && d.expiresAt < today;
    const soon = d.expiresAt && !expired && d.expiresAt.getTime() - today.getTime() < 30 * 86400_000;
    const canRemove = canUpload && (mode === "central" || d.source === "DEALERSHIP");
    return (
      <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{d.category === "ACHIEVEMENT_CERTIFICATE" ? <Award className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{d.title}</p>
            <p className="text-xs text-ink-500">
              {DEALER_DOC_CATEGORY[d.category]} · {d.source === "YADEA" ? "Issued by YADEA" : "Uploaded by the dealership"} · {fmtDate(d.createdAt)} · {d.uploadedBy.name}
            </p>
            {d.description && <p className="mt-0.5 text-sm text-ink-600">{d.description}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.expiresAt && <Badge tone={expired ? "red" : soon ? "amber" : "gray"}>{expired ? "Expired" : "Expires"} {fmtDate(d.expiresAt)}</Badge>}
              <span className="text-xs text-ink-400">{d.file.originalName} · {(d.file.size / 1024).toFixed(0)} KB</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">View</a>
          <a href={`/api/files/${d.fileId}?download=1`} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"><Download className="h-4 w-4" /> Download</a>
          {canRemove && <DeleteDocumentButton documentId={d.id} title={d.title} />}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {!hasRegistration && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {mode === "dealer" ? "Your certificate of registration hasn't been uploaded yet. Add it so YADEA has it on file." : `${dealershipName} hasn't uploaded a certificate of registration yet.`}
        </p>
      )}
      <Card>
        <CardHeader
          title="Registration & business documents"
          description="Shared between the dealership and YADEA"
          action={canUpload ? <UploadDocumentDialog dealershipId={dealershipId} dealershipName={mode === "central" ? dealershipName : undefined} categories={mode === "central" ? ALL.filter((c) => c !== "ACHIEVEMENT_CERTIFICATE") : DEALER_UPLOADABLE} /> : undefined}
        />
        {others.length === 0 ? <EmptyState icon={FileBadge2} title="No documents yet" description="Certificate of registration, licences and agreements will be listed here." /> : <ul className="divide-y divide-ink-100">{others.map(row)}</ul>}
      </Card>
      <Card>
        <CardHeader
          title="Achievement certificates"
          description={mode === "dealer" ? "Awarded by team YADEA — download and display them in your showroom" : "Certificates issued to this dealership"}
          action={mode === "central" && canUpload ? <UploadDocumentDialog dealershipId={dealershipId} dealershipName={dealershipName} categories={["ACHIEVEMENT_CERTIFICATE"]} defaultCategory="ACHIEVEMENT_CERTIFICATE" label="Issue certificate" /> : undefined}
        />
        {certificates.length === 0 ? <EmptyState icon={Award} title="No certificates yet" description={mode === "dealer" ? "When YADEA recognises your dealership with a certificate, it will appear here to download." : "Issue a certificate to recognise a milestone."} /> : <ul className="divide-y divide-ink-100">{certificates.map(row)}</ul>}
      </Card>
    </div>
  );
}
