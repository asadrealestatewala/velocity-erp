"use client";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { recordPaymentAction } from "@/server/actions/ledger";
import { PAYMENT_METHOD_LABEL } from "@/lib/ops-constants";
import { FileSlots, appendSlots, newSlot, slotsTooLarge, type FileSlot } from "./file-slots";
import { isoDay } from "@/lib/utils";
import { toast } from "sonner";

export function RecordPaymentDialog({ dealershipId, orders, suggestedAmount }: { dealershipId: string; orders: { id: string; label: string }[]; suggestedAmount?: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedAmount && suggestedAmount > 0 ? String(suggestedAmount) : "");
  const [date, setDate] = useState(isoDay(new Date()));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [slots, setSlots] = useState<FileSlot[]>([newSlot("PROOF_OF_PAYMENT")]);
  const { run, pending, fieldErrors } = useAction(recordPaymentAction, { onSuccess: () => { setOpen(false); setSlots([newSlot("PROOF_OF_PAYMENT")]); setAmount(""); setReference(""); setDescription(""); } });

  const submit = () => {
    const tooLarge = slotsTooLarge(slots);
    if (tooLarge) return void toast.error(tooLarge);
    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("entryDate", date);
    fd.set("method", method);
    fd.set("reference", reference);
    fd.set("description", description);
    fd.set("orderId", orderId);
    fd.set("currency", "PKR");
    appendSlots(fd, slots);
    run(dealershipId, fd);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Record a payment to YADEA"
      description="Attach proof of payment. Your balance reduces once YADEA accounts verifies it."
      trigger={<Button><Banknote className="h-4 w-4" /> Record payment</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={submit}>Submit payment</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (PKR)" required error={fieldErrors.amount}>{(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Payment date" required error={fieldErrors.entryDate}>{(p) => <Input {...p} type="date" max={isoDay(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Method" required>{(p) => <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Transaction / cheque reference">{(p) => <Input {...p} placeholder="e.g. bank transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        {orders.length > 0 && (
          <Field label="Applies to order" help="Optional" className="sm:col-span-2">
            {(p) => <Select {...p} value={orderId} onChange={(e) => setOrderId(e.target.value)}><option value="">General account payment</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>}
          </Field>
        )}
        <Field label="Note" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <p className="label">Proof of payment <span className="text-brand-600">*</span></p>
          <FileSlots slots={slots} onChange={setSlots} error={fieldErrors.proof} />
        </div>
      </div>
    </Dialog>
  );
}
