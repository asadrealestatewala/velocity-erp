"use client";
import { useState } from "react";
import { Check, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { approveOrderAction, rejectOrderAction, updateDispatchAction } from "@/server/actions/procurement";
import { DISPATCH_FLOW, DISPATCH_STATUS } from "@/lib/ops-constants";
import { fmtMoney } from "@/lib/utils";

type Line = { id: string; name: string; quantity: number; unitPrice: number };

export function ApproveOrderDialog({ orderId, number, lines, currency, defaultDate }: { orderId: string; number: number; lines: Line[]; currency: string; defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.unitPrice)])));
  const [date, setDate] = useState(defaultDate ?? "");
  const [notes, setNotes] = useState("");
  const { run, pending, fieldErrors } = useAction(approveOrderAction, { onSuccess: () => setOpen(false) });
  const total = lines.reduce((s, l) => s + l.quantity * (Number(prices[l.id]) || 0), 0);
  const unpriced = lines.some((l) => !(Number(prices[l.id]) > 0));
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={`Approve order PO-${number}`}
      description="Confirm the price of each line and give the dealership an expected delivery date. Prices left at 0 will show as “to be confirmed”."
      trigger={<Button><Check className="h-4 w-4" /> Approve</Button>}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} onClick={() => run({ orderId, prices: Object.fromEntries(lines.map((l) => [l.id, Number(prices[l.id]) || 0])), expectedDeliveryDate: date || null, internalNotes: notes })}>Approve order</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Unit price ({currency})</th><th className="th text-right">Line total</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="td font-medium text-ink-900">{l.name}</td>
                  <td className="td text-right tabular-nums">{l.quantity}</td>
                  <td className="td text-right"><Input aria-label={`Unit price for ${l.name}`} type="number" min={0} step="0.01" inputMode="decimal" className="ml-auto h-8 w-32 py-1 text-right" value={prices[l.id]} onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value })} /></td>
                  <td className="td text-right tabular-nums">{fmtMoney(l.quantity * (Number(prices[l.id]) || 0), currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="td text-right font-semibold">Order total</td><td className="td text-right font-bold tabular-nums">{fmtMoney(total, currency)}</td></tr></tfoot>
          </table>
        </div>
        {unpriced && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Some lines have no price. They will be invoiced at 0 unless you enter a price.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expected delivery date" error={fieldErrors.expectedDeliveryDate}>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Internal note" help="Visible to YADEA staff only">{(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}

export function RejectOrderDialog({ orderId, number }: { orderId: string; number: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending, fieldErrors } = useAction(rejectOrderAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="sm"
      title={`Reject order PO-${number}`}
      description="The dealership is notified with your reason."
      trigger={<Button variant="secondary"><X className="h-4 w-4" /> Reject</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={pending} onClick={() => run(orderId, reason)}>Reject order</Button></>}
    >
      <Field label="Reason" required error={fieldErrors[""] ?? undefined}>{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item discontinued, please reorder the replacement model" />}</Field>
    </Dialog>
  );
}

export function DispatchDialog({
  orderId, number, current, expectedDate, courier, trackingNumber, label = "Update delivery",
}: { orderId: string; number: number; current: string; expectedDate?: string; courier?: string | null; trackingNumber?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const currentIdx = DISPATCH_FLOW.indexOf(current as (typeof DISPATCH_FLOW)[number]);
  const next = DISPATCH_FLOW.slice(currentIdx + 1);
  const [status, setStatus] = useState<string>(next[0] ?? "");
  const [date, setDate] = useState(expectedDate ?? "");
  const [c, setC] = useState(courier ?? "");
  const [t, setT] = useState(trackingNumber ?? "");
  const [note, setNote] = useState("");
  const { run, pending, fieldErrors } = useAction(updateDispatchAction, { onSuccess: () => setOpen(false) });
  if (next.length === 0) return null;
  const delivering = status === "DELIVERED";
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title={`Update delivery — PO-${number}`}
      description={delivering ? "Marking an order delivered asks the dealership to confirm receipt; their stock updates when they do." : "The dealership is notified of each step. The invoice is raised when the order is dispatched."}
      trigger={<Button size="sm"><Truck className="h-4 w-4" /> {label}</Button>}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} disabled={!status} onClick={() => run({ orderId, dispatchStatus: status as "PACKING", expectedDeliveryDate: date || null, courier: c, trackingNumber: t, note })}>Save update</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New status" required error={fieldErrors.dispatchStatus} className="sm:col-span-2">
          {(p) => <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>{next.map((s) => <option key={s} value={s}>{DISPATCH_STATUS[s]?.label}</option>)}</Select>}
        </Field>
        {!delivering && <Field label="Expected delivery date" error={fieldErrors.expectedDeliveryDate}>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>}
        <Field label="Courier">{(p) => <Input {...p} placeholder="e.g. TCS, Leopards, own fleet" value={c} onChange={(e) => setC(e.target.value)} />}</Field>
        <Field label="Tracking / consignment no.">{(p) => <Input {...p} value={t} onChange={(e) => setT(e.target.value)} />}</Field>
        <Field label="Note for the dealership" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
