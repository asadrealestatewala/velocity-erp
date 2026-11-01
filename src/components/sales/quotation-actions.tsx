"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Check, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { convertQuotationAction, updateQuotationStatusAction } from "@/server/actions/quotations";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "CONVERTED";

export function QuotationActions({ id, status, expired, canConvert }: { id: string; status: Status; expired: boolean; canConvert: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const move = useAction(updateQuotationStatusAction, { onSuccess: () => setOpen(false) });
  const convert = useAction(convertQuotationAction, { onSuccess: (d) => d && router.push(`/portal/sales-orders/${d.id}`) });
  if (status === "REJECTED" || status === "CONVERTED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && <Button variant="secondary" loading={move.pending} onClick={() => move.run(id, "SENT")}><Send className="h-4 w-4" /> Mark as sent</Button>}
      {status !== "ACCEPTED" && <Button variant="secondary" loading={move.pending} onClick={() => move.run(id, "ACCEPTED")}><Check className="h-4 w-4" /> Customer accepted</Button>}
      {canConvert && !expired && <Button loading={convert.pending} onClick={() => convert.run(id)}><ArrowRightLeft className="h-4 w-4" /> Convert to order</Button>}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title="Mark as rejected?"
        description="The customer declined this quotation. It can't be converted afterwards."
        trigger={<Button variant="secondary"><X className="h-4 w-4" /> Rejected</Button>}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep open</Button><Button variant="danger" loading={move.pending} onClick={() => move.run(id, "REJECTED", reason)}>Mark rejected</Button></>}
      >
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
