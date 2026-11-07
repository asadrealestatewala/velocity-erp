"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { approveReturnAction, rejectReturnAction } from "@/server/actions/returns";
import { REFUND_METHOD_LABEL } from "@/lib/ops-constants";

export function ReturnActions({ id, restock, refund }: { id: string; restock: boolean; refund: string }) {
  const [method, setMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const approve = useAction(approveReturnAction);
  const reject = useAction(rejectReturnAction, { onSuccess: () => setOpen(false) });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Refund via">{(p) => <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(REFUND_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
      <Button loading={approve.pending} onClick={() => approve.run(id, method)} title={restock ? "Restocks the items and records the refund" : "Records the refund; items are not restocked"}><Check className="h-4 w-4" /> Approve &amp; refund {refund}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Reject this return?" description="No stock or refund is recorded."
        trigger={<Button variant="secondary"><X className="h-4 w-4" /> Reject</Button>}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Back</Button><Button variant="danger" loading={reject.pending} onClick={() => reject.run(id, reason)}>Reject return</Button></>}>
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
