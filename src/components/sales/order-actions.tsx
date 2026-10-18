"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { cancelSalesOrderAction, confirmSalesOrderAction } from "@/server/actions/sales-orders";

export function SalesOrderActions({ id, status }: { id: string; status: "DRAFT" | "CONFIRMED" | "CANCELLED" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const confirm = useAction(confirmSalesOrderAction);
  const cancel = useAction(cancelSalesOrderAction, { onSuccess: () => setOpen(false) });
  if (status === "CANCELLED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <Button loading={confirm.pending} onClick={() => confirm.run(id)}><Check className="h-4 w-4" /> Confirm &amp; deduct stock</Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={status === "CONFIRMED" ? "Cancel this confirmed order?" : "Cancel this draft?"}
        description={status === "CONFIRMED" ? "The items will be added back to your showroom stock." : "No stock has been deducted for a draft."}
        trigger={<Button variant="secondary"><X className="h-4 w-4" /> Cancel order</Button>}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep order</Button><Button variant="danger" loading={cancel.pending} onClick={() => cancel.run(id, reason)}>Cancel order</Button></>}
      >
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
