"use client";
import { useState } from "react";
import { PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { cancelStockOrderAction, confirmReceiptAction } from "@/server/actions/procurement";
import { ConfirmButton } from "@/components/ui/confirm";

export function CancelStockOrderButton({ orderId, number }: { orderId: string; number: number }) {
  const { run } = useAction(cancelStockOrderAction);
  return (
    <ConfirmButton
      trigger={<Button variant="secondary"><X className="h-4 w-4" /> Cancel order</Button>}
      title={`Cancel order PO-${number}?`}
      description="Procurement hasn't approved this order yet, so it can be withdrawn. This can't be undone."
      confirmLabel="Cancel order"
      onConfirm={async () => { await run(orderId); }}
    />
  );
}

export function ConfirmReceiptDialog({ orderId, number, lines }: { orderId: string; number: number; lines: { id: string; name: string; quantity: number }[] }) {
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])));
  const { run, pending, error } = useAction(confirmReceiptAction, { onSuccess: () => setOpen(false) });
  const short = lines.some((l) => Number(received[l.id]) < l.quantity);
  const invalid = lines.some((l) => !(Number(received[l.id]) >= 0) || Number(received[l.id]) > l.quantity || !Number.isInteger(Number(received[l.id])));
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title={`Confirm receipt of PO-${number}`}
      description="Enter what actually arrived. These quantities are added to your showroom inventory."
      trigger={<Button><PackageCheck className="h-4 w-4" /> Confirm receipt</Button>}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} disabled={invalid} onClick={() => run({ orderId, received: Object.fromEntries(lines.map((l) => [l.id, Number(received[l.id])])) })}>Add to my stock</Button>
        </>
      }
    >
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-ink-900">{l.name}</p><p className="text-xs text-ink-500">Ordered: {l.quantity}</p></div>
            <Input aria-label={`Received quantity of ${l.name}`} type="number" min={0} max={l.quantity} inputMode="numeric" className="h-9 w-24 py-1 text-right" value={received[l.id]} onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })} />
          </div>
        ))}
        {short && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Some quantities are short. Procurement will be told about the shortfall.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}
