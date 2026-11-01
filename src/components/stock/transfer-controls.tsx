"use client";
import { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { closeTransferAction, receiveTransferAction, sendTransferAction } from "@/server/actions/stock-transfers";

export type SendableItem = { id: string; name: string; code: string; quantity: number };

export function NewTransferDialog({ dealershipId, outlets, items }: { dealershipId: string; outlets: { id: string; name: string }[]; items: SendableItem[] }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: "", quantity: "1" }]);
  const { run, pending, fieldErrors, error } = useAction(sendTransferAction, { onSuccess: () => { setOpen(false); setLines([{ itemId: "", quantity: "1" }]); setNote(""); } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const over = lines.some((l) => l.itemId && Number(l.quantity) > (byId.get(l.itemId)?.quantity ?? 0));
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title="Transfer stock to another outlet"
      description="The stock leaves your inventory now and joins theirs when they confirm it arrived."
      trigger={<Button><Truck className="h-4 w-4" /> New transfer</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!to || over || lines.every((l) => !l.itemId)} onClick={() => run(dealershipId, { toDealershipId: to, note, lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })) })}>Send stock</Button></>}
    >
      {outlets.length === 0 ? (
        <p className="text-sm text-ink-600">There is no other active outlet in your group to transfer to.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Send to" required error={fieldErrors.toDealershipId}>
            {(p) => (
              <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select an outlet…</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            )}
          </Field>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <Field label={idx === 0 ? "Item" : "Item"} className="min-w-0">
                  {(p) => (
                    <Select {...p} value={l.itemId} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}>
                      <option value="">Select an item…</option>
                      {items.map((i) => <option key={i.id} value={i.id} disabled={lines.some((x, j) => j !== idx && x.itemId === i.id)}>{i.name} ({i.quantity} on hand)</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Qty">{(p) => <Input {...p} type="number" min={1} max={byId.get(l.itemId)?.quantity} inputMode="numeric" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />}</Field>
                <Button variant="ghost" size="xs" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="secondary" size="xs" onClick={() => setLines([...lines, { itemId: "", quantity: "1" }])}><Plus className="h-3.5 w-3.5" /> Add another item</Button>
            {over && <p className="text-xs text-red-600">You are sending more than you have on hand.</p>}
            {fieldErrors.lines && <p className="text-xs text-red-600">{fieldErrors.lines}</p>}
          </div>
          <Field label="Note" help="Optional, e.g. vehicle or driver">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}

export function ReceiveTransferDialog({ dealershipId, transferId, lines }: { dealershipId: string; transferId: string; lines: { id: string; name: string; quantity: number }[] }) {
  const [open, setOpen] = useState(false);
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])));
  const { run, pending } = useAction(receiveTransferAction, { onSuccess: () => setOpen(false) });
  const invalid = lines.some((l) => { const n = Number(got[l.id]); return !Number.isInteger(n) || n < 0 || n > l.quantity; });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title="Confirm what arrived"
      description="Reduce a quantity if the delivery was short — the difference goes back to the sender."
      trigger={<Button size="xs">Receive</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={invalid} onClick={() => run(dealershipId, { transferId, received: Object.fromEntries(lines.map((l) => [l.id, Number(got[l.id])])) })}>Confirm receipt</Button></>}
    >
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
            <span>{l.name} <span className="text-ink-400">of {l.quantity}</span></span>
            <Input aria-label={`Received ${l.name}`} type="number" min={0} max={l.quantity} inputMode="numeric" value={got[l.id]} onChange={(e) => setGot({ ...got, [l.id]: e.target.value })} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function CloseTransferButton({ dealershipId, transferId, kind }: { dealershipId: string; transferId: string; kind: "CANCEL" | "REJECT" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction(closeTransferAction, { onSuccess: () => setOpen(false) });
  const cancel = kind === "CANCEL";
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={cancel ? "Cancel this transfer?" : "Reject this transfer?"}
      description={cancel ? "The stock goes back into your inventory." : "The stock goes back to the sender."}
      trigger={<Button size="xs" variant="secondary">{cancel ? "Cancel" : "Reject"}</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep transfer</Button><Button variant="danger" loading={pending} onClick={() => run(dealershipId, { transferId, kind, reason })}>{cancel ? "Cancel transfer" : "Reject transfer"}</Button></>}
    >
      <Field label="Reason" help="Optional">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
    </Dialog>
  );
}
