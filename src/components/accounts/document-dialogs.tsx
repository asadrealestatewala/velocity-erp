"use client";
import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { deleteDealerDocumentAction, uploadDealerDocumentAction } from "@/server/actions/dealer-docs";
import { DEALER_DOC_CATEGORY } from "@/lib/ops-constants";

type Category = keyof typeof DEALER_DOC_CATEGORY;

export function UploadDocumentDialog({ dealershipId, dealershipName, categories, defaultCategory, label = "Upload document" }: { dealershipId: string; dealershipName?: string; categories: Category[]; defaultCategory?: Category; label?: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>(defaultCategory ?? categories[0]!);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { run, pending, fieldErrors } = useAction(uploadDealerDocumentAction, { onSuccess: () => { setOpen(false); setTitle(""); setDescription(""); setExpiresAt(""); if (fileRef.current) fileRef.current.value = ""; } });
  const submit = () => {
    const fd = new FormData();
    fd.set("category", category);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("expiresAt", expiresAt);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set("file", f);
    run(dealershipId, fd);
  };
  const certificate = category === "ACHIEVEMENT_CERTIFICATE";
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title={dealershipName ? `${certificate ? "Issue certificate to" : "Add document for"} ${dealershipName}` : "Upload a document"}
      description={dealershipName ? "The dealership can see and download this from its portal." : "Shared with YADEA — both sides see the same list."}
      trigger={<Button><Upload className="h-4 w-4" /> {label}</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={submit}>{certificate ? "Issue certificate" : "Upload"}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" required className="sm:col-span-2">{(p) => <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as Category)}>{categories.map((c) => <option key={c} value={c}>{DEALER_DOC_CATEGORY[c]}</option>)}</Select>}</Field>
        <Field label="Title" required error={fieldErrors.title} className="sm:col-span-2">{(p) => <Input {...p} placeholder={certificate ? "e.g. Top Performing Dealership — Q3 2026" : "e.g. Certificate of registration"} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        {!certificate && <Field label="Expires on" help="Optional — for licences and registrations" className="sm:col-span-2">{(p) => <Input {...p} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</Field>}
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="File" required error={fieldErrors.file} help="PDF, JPG, PNG, WEBP, DOCX or XLSX · up to 10 MB" className="sm:col-span-2">
          {(p) => <input {...p} ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5" />}
        </Field>
      </div>
    </Dialog>
  );
}

export function DeleteDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const { run } = useAction(deleteDealerDocumentAction);
  return (
    <ConfirmButton
      trigger={<Button size="iconSm" variant="ghost" aria-label={`Remove ${title}`}><Trash2 className="h-4 w-4" /></Button>}
      title="Remove this document?"
      description={`“${title}” will no longer be listed or downloadable. The change is recorded in the audit log.`}
      confirmLabel="Remove"
      onConfirm={async () => { await run(documentId); }}
    />
  );
}
