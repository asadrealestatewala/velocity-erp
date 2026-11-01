"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { discardWarrantyClaimAction, reviewWarrantyClaimAction, submitWarrantyClaimAction } from "@/server/actions/service-workshop";

/** Dealership side: send a draft to YADEA, or throw it away. */
export function ClaimDealerActions({ id, status, jobReady }: { id: string; status: string; jobReady: boolean }) {
  const submit = useAction(submitWarrantyClaimAction);
  const discard = useAction(discardWarrantyClaimAction);
  if (status !== "DRAFT") return null;
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" disabled={!jobReady} title={jobReady ? undefined : "Finish the job card first"} loading={submit.pending} onClick={() => submit.run(id)}>Submit</Button>
      <Button size="sm" variant="ghost" loading={discard.pending} onClick={() => discard.run(id)}>Discard</Button>
    </div>
  );
}

/** Central side: approve (optionally for less) or reject with a reason. */
export function ClaimReviewButton({ id, claimAmount, currency }: { id: string; claimAmount: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [amount, setAmount] = useState(String(claimAmount));
  const [note, setNote] = useState("");
  const review = useAction(reviewWarrantyClaimAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open} onOpenChange={setOpen} size="sm" title="Review warranty claim" description={`Claimed: ${claimAmount.toLocaleString()} ${currency}`}
      trigger={<Button size="sm">Review</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button variant={decision === "REJECTED" ? "danger" : "primary"} loading={review.pending} onClick={() => review.run({ claimId: id, decision, approvedAmount: decision === "APPROVED" ? Number(amount) : undefined, note })}>{decision === "APPROVED" ? "Approve claim" : "Reject claim"}</Button></>}
    >
      <div className="grid gap-4">
        <Field label="Decision">{(p) => <Select {...p} value={decision} onChange={(e) => setDecision(e.target.value as "APPROVED" | "REJECTED")}><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></Select>}</Field>
        {decision === "APPROVED" && <Field label={`Approved amount (${currency})`} error={review.fieldErrors.approvedAmount}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>}
        <Field label={decision === "REJECTED" ? "Reason (required)" : "Note (optional)"} error={review.fieldErrors.note}>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <FormError error={review.error} />
      </div>
    </Dialog>
  );
}
