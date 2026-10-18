"use client";
import { useState } from "react";
import { BadgeCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { postLedgerEntryAction, rejectPaymentAction, verifyPaymentAction } from "@/server/actions/ledger";
import { isoDay } from "@/lib/utils";

export function VerifyPaymentButton({ entryId }: { entryId: string }) {
  const { run, pending } = useAction(verifyPaymentAction);
  return <Button size="xs" loading={pending} onClick={() => run(entryId)}><BadgeCheck className="h-3.5 w-3.5" /> Verify</Button>;
}

export function RejectPaymentDialog({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction(rejectPaymentAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="sm"
      title="Reject this payment"
      description="The dealership is notified with your reason and can submit it again with correct proof."
      trigger={<Button size="xs" variant="secondary"><X className="h-3.5 w-3.5" /> Reject</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={pending} onClick={() => run(entryId, reason)}>Reject payment</Button></>}
    >
      <Field label="Reason" required>{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Amount on the slip doesn't match" />}</Field>
    </Dialog>
  );
}

const TYPES = [
  { value: "INVOICE", label: "Invoice (adds to balance owed)", direction: "DEBIT" },
  { value: "PAYMENT", label: "Payment received (reduces balance)", direction: "CREDIT" },
  { value: "CREDIT_NOTE", label: "Credit note (reduces balance)", direction: "CREDIT" },
  { value: "ADJUSTMENT", label: "Adjustment — debit (adds to balance)", direction: "DEBIT" },
  { value: "ADJUSTMENT_CR", label: "Adjustment — credit (reduces balance)", direction: "CREDIT" },
] as const;

export function PostEntryDialog({ dealershipId }: { dealershipId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("INVOICE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const { run, pending, fieldErrors } = useAction(postLedgerEntryAction, { onSuccess: () => { setOpen(false); setAmount(""); setReference(""); setDescription(""); } });
  const t = TYPES.find((x) => x.value === type)!;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title="Post a ledger entry"
      description="Posted entries change the dealer's balance immediately and are recorded in the audit log."
      trigger={<Button variant="secondary"><Plus className="h-4 w-4" /> Post entry</Button>}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} onClick={() => run({ dealershipId, type: type === "ADJUSTMENT_CR" ? "ADJUSTMENT" : type, direction: t.direction, amount: Number(amount), currency: "PKR", entryDate: new Date(date), reference, description })}>Post entry</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry type" required className="sm:col-span-2">{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value as typeof type)}>{TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>}</Field>
        <Field label="Amount (PKR)" required error={fieldErrors.amount}>{(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Date" required>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Reference" className="sm:col-span-2">{(p) => <Input {...p} placeholder="Invoice, cheque or transaction number" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Field label="Description" required error={fieldErrors.description} className="sm:col-span-2">{(p) => <Input {...p} placeholder="e.g. Opening balance brought forward" value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
