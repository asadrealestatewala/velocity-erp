"use client";
import { useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { openJobCardAction, updateServiceBookingStatusAction } from "@/server/actions/service-workshop";

export function BookingActions({ id, status, dealershipId, complaint }: { id: string; status: string; dealershipId: string; complaint: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const update = useAction(updateServiceBookingStatusAction);
  const cancel = useAction(updateServiceBookingStatusAction, { onSuccess: () => setOpen(false) });
  const checkIn = useAction(openJobCardAction, { onSuccess: (d) => router.push(`/portal/service/${(d as { id: string }).id}`) });
  if (status !== "REQUESTED" && status !== "CONFIRMED") return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === "REQUESTED" && <Button size="sm" variant="secondary" loading={update.pending} onClick={() => update.run(id, { status: "CONFIRMED" })}><Check className="h-3.5 w-3.5" /> Confirm</Button>}
      <Button size="sm" loading={checkIn.pending} onClick={() => checkIn.run(dealershipId, { complaint: complaint?.trim() || "Scheduled service", isWarranty: false, customerName: "from booking" }, id)}><ClipboardCheck className="h-3.5 w-3.5" /> Check in</Button>
      <Button size="sm" variant="ghost" loading={update.pending} onClick={() => update.run(id, { status: "NO_SHOW" })}>No-show</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title="Cancel this booking?"
        trigger={<Button size="sm" variant="ghost"><X className="h-3.5 w-3.5" /> Cancel</Button>}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep booking</Button><Button variant="danger" loading={cancel.pending} onClick={() => cancel.run(id, { status: "CANCELLED", reason })}>Cancel booking</Button></>}
      >
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
