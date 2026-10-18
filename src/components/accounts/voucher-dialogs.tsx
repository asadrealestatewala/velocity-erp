"use client";
import { useState } from "react";
import { Check, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { addVoucherDocumentsAction, createVoucherAction, removeVoucherDocumentAction, reviewVoucherAction } from "@/server/actions/vouchers";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABEL } from "@/lib/ops-constants";
import { isoDay } from "@/lib/utils";
import { toast } from "sonner";
import { FileSlots, appendSlots, newSlot, slotsTooLarge, type FileSlot } from "./file-slots";

export function CreateVoucherDialog({ dealershipId }: { dealershipId: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ voucherDate: isoDay(new Date()), category: EXPENSE_CATEGORIES[0] as string, payee: "", description: "", amount: "", taxAmount: "0", method: "", reference: "" });
  const [slots, setSlots] = useState<FileSlot[]>([newSlot("RECEIPT")]);
  const { run, pending, fieldErrors } = useAction(createVoucherAction, { onSuccess: () => { setOpen(false); setSlots([newSlot("RECEIPT")]); setV((x) => ({ ...x, payee: "", description: "", amount: "", taxAmount: "0", reference: "" })); } });
  const submit = () => {
    const tooLarge = slotsTooLarge(slots);
    if (tooLarge) return void toast.error(tooLarge);
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val);
    fd.set("currency", "PKR");
    appendSlots(fd, slots);
    run(dealershipId, fd);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New expense voucher"
      description="Record an expense and attach the receipt, invoice or proof of payment — they are kept for your tax records."
      trigger={<Button><Plus className="h-4 w-4" /> New voucher</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={submit}>Save voucher</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required error={fieldErrors.voucherDate}>{(p) => <Input {...p} type="date" value={v.voucherDate} onChange={(e) => setV({ ...v, voucherDate: e.target.value })} />}</Field>
        <Field label="Category" required error={fieldErrors.category}>{(p) => <Select {...p} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}</Field>
        <Field label="Paid to">{(p) => <Input {...p} placeholder="Supplier or payee" value={v.payee} onChange={(e) => setV({ ...v, payee: e.target.value })} />}</Field>
        <Field label="Payment method">{(p) => <Select {...p} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}><option value="">Not specified</option>{Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Amount (PKR)" required error={fieldErrors.amount}>{(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />}</Field>
        <Field label="Of which tax" help="Sales tax / withholding included in the amount" error={fieldErrors.taxAmount}>{(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={v.taxAmount} onChange={(e) => setV({ ...v, taxAmount: e.target.value })} />}</Field>
        <Field label="Reference" className="sm:col-span-2">{(p) => <Input {...p} placeholder="Invoice or receipt number" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="sm:col-span-2">
          <p className="label">Supporting documents</p>
          <FileSlots slots={slots} onChange={setSlots} />
        </div>
      </div>
    </Dialog>
  );
}

export function AddVoucherDocsDialog({ voucherId, number }: { voucherId: string; number: number }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<FileSlot[]>([newSlot("RECEIPT")]);
  const { run, pending, fieldErrors } = useAction(addVoucherDocumentsAction, { onSuccess: () => { setOpen(false); setSlots([newSlot("RECEIPT")]); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title={`Attach documents to EV-${number}`}
      description="Add proof of payment, proof of invoice, the invoice or receipts."
      trigger={<Button size="xs" variant="secondary"><Paperclip className="h-3.5 w-3.5" /> Attach</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => { const tooLarge = slotsTooLarge(slots); if (tooLarge) return void toast.error(tooLarge); const fd = new FormData(); appendSlots(fd, slots); run(voucherId, fd); }}>Attach</Button></>}
    >
      <FileSlots slots={slots} onChange={setSlots} error={fieldErrors.file_0} />
    </Dialog>
  );
}

export function RemoveVoucherDocButton({ attachmentId }: { attachmentId: string }) {
  const { run, pending } = useAction(removeVoucherDocumentAction);
  return <Button size="iconSm" variant="ghost" loading={pending} aria-label="Remove document" onClick={() => run(attachmentId)}><X className="h-3.5 w-3.5" /></Button>;
}

export function ReviewVoucherButtons({ voucherId, number }: { voucherId: string; number: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const approve = useAction(reviewVoucherAction);
  const reject = useAction(reviewVoucherAction, { onSuccess: () => setOpen(false) });
  return (
    <div className="flex gap-1.5">
      <Button size="xs" loading={approve.pending} onClick={() => approve.run(voucherId, "APPROVED")}><Check className="h-3.5 w-3.5" /> Approve</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={`Reject voucher EV-${number}`}
        trigger={<Button size="xs" variant="secondary"><X className="h-3.5 w-3.5" /> Reject</Button>}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={reject.pending} onClick={() => reject.run(voucherId, "REJECTED", note)}>Reject</Button></>}
      >
        <Field label="Reason" required error={reject.fieldErrors.note}>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
