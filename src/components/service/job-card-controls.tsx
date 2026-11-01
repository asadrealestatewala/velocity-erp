"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import {
  addJobCardPartAction, createWarrantyClaimAction, removeJobCardPartAction, updateJobCardAction, updateJobCardStatusAction,
} from "@/server/actions/service-workshop";
import { JOB_CARD_FLOW, JOB_CARD_STATUS } from "@/lib/ops-constants";
import { fmtMoney } from "@/lib/utils";

export type JobDetails = {
  id: string; status: string; isWarranty: boolean; diagnosis: string; workDone: string; odometerKm: string;
  labourCharge: number; discount: number; technicianId: string; currency: string; partsTotal: number; total: number;
};
export type PartLine = { id: string; name: string; code: string | null; quantity: number; unitPrice: number; lineTotal: number };
export type StockPart = { id: string; name: string; code: string; quantity: number; price: number | null };

const ACTION_LABEL: Record<string, string> = { IN_PROGRESS: "Start work", AWAITING_PARTS: "Awaiting parts", COMPLETED: "Mark ready for delivery", DELIVERED: "Hand over to customer" };

export function JobCardStatusButtons({ job }: { job: JobDetails }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const update = useAction(updateJobCardStatusAction);
  const cancel = useAction(updateJobCardStatusAction, { onSuccess: () => setOpen(false) });
  const next = (JOB_CARD_FLOW[job.status] ?? []).filter((s) => s !== "CANCELLED");
  const canCancel = (JOB_CARD_FLOW[job.status] ?? []).includes("CANCELLED");
  if (!next.length && !canCancel) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s, i) => (
        <Button key={s} variant={i === next.length - 1 || s === "DELIVERED" ? "primary" : "secondary"} loading={update.pending} onClick={() => update.run(job.id, { status: s as "IN_PROGRESS" })}>
          {job.status === "COMPLETED" && s === "IN_PROGRESS" ? "Reopen job" : (ACTION_LABEL[s] ?? JOB_CARD_STATUS[s]?.label)}
        </Button>
      ))}
      {canCancel && (
        <Dialog
          open={open} onOpenChange={setOpen} size="sm" title="Cancel this job card?" description="Every part used on it goes back into your stock."
          trigger={<Button variant="ghost">Cancel job</Button>}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep job</Button><Button variant="danger" loading={cancel.pending} onClick={() => cancel.run(job.id, { status: "CANCELLED", reason })}>Cancel job card</Button></>}
        >
          <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </Dialog>
      )}
    </div>
  );
}

export function JobCardEditor({ job, technicians, editable, canWarranty }: { job: JobDetails; technicians: { id: string; name: string }[]; editable: boolean; canWarranty: boolean }) {
  const [v, setV] = useState({ diagnosis: job.diagnosis, workDone: job.workDone, odometerKm: job.odometerKm, labourCharge: String(job.labourCharge), discount: String(job.discount), technicianId: job.technicianId });
  const [isWarranty, setIsWarranty] = useState(job.isWarranty);
  const save = useAction(updateJobCardAction);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Card>
      <CardHeader title="Diagnosis & work" description={editable ? undefined : "This job is closed, so its details are read-only."} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Diagnosis" className="sm:col-span-2" error={save.fieldErrors.diagnosis}>{(p) => <Textarea {...p} disabled={!editable} value={v.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} />}</Field>
        <Field label="Work done" className="sm:col-span-2" error={save.fieldErrors.workDone}>{(p) => <Textarea {...p} disabled={!editable} value={v.workDone} onChange={(e) => set("workDone", e.target.value)} />}</Field>
        <Field label="Odometer (km)" error={save.fieldErrors.odometerKm}>{(p) => <Input {...p} type="number" min={0} disabled={!editable} value={v.odometerKm} onChange={(e) => set("odometerKm", e.target.value)} />}</Field>
        <Field label="Technician" error={save.fieldErrors.technicianId}>{(p) => <Select {...p} disabled={!editable} value={v.technicianId} onChange={(e) => set("technicianId", e.target.value)}><option value="">Unassigned</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
        <Field label={`Labour charge (${job.currency})`} error={save.fieldErrors.labourCharge}>{(p) => <Input {...p} type="number" min={0} step="0.01" disabled={!editable} value={v.labourCharge} onChange={(e) => set("labourCharge", e.target.value)} />}</Field>
        <Field label="Discount" error={save.fieldErrors.discount}>{(p) => <Input {...p} type="number" min={0} step="0.01" disabled={!editable || isWarranty} value={v.discount} onChange={(e) => set("discount", e.target.value)} />}</Field>
        <Checkbox className="sm:col-span-2" label="Warranty job — customer pays nothing; cost is claimed from YADEA" disabled={!editable} checked={isWarranty} onChange={(e) => setIsWarranty(e.target.checked)} />
        {!canWarranty && isWarranty && <p className="text-xs text-ink-500 sm:col-span-2">You can mark a job as warranty, but only a manager can raise the claim.</p>}
        {editable && (
          <div className="sm:col-span-2"><FormError error={save.error} /></div>
        )}
        {editable && (
          <div className="sm:col-span-2"><Button loading={save.pending} onClick={() => save.run(job.id, { ...v, odometerKm: v.odometerKm, labourCharge: Number(v.labourCharge) || 0, discount: isWarranty ? 0 : Number(v.discount) || 0, isWarranty })}>Save changes</Button></div>
        )}
      </div>
    </Card>
  );
}

export function PartsPanel({ job, parts, stock, editable }: { job: JobDetails; parts: PartLine[]; stock: StockPart[]; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const add = useAction(addJobCardPartAction, { onSuccess: () => { setOpen(false); setProductId(""); setQuantity("1"); setUnitPrice(""); } });
  const remove = useAction(removeJobCardPartAction);
  const picked = stock.find((s) => s.id === productId);
  return (
    <Card>
      <CardHeader
        title="Spare parts used"
        description="Adding a part deducts it from your showroom stock; removing it puts it back."
        action={editable && (
          <Dialog
            open={open} onOpenChange={setOpen} title="Use a spare part" description="Only parts in stock at your showroom are listed."
            trigger={<Button size="sm" variant="secondary"><Plus className="h-4 w-4" /> Add part</Button>}
            footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button loading={add.pending} disabled={!productId} onClick={() => add.run(job.id, { productId, quantity: Number(quantity), unitPrice: unitPrice === "" ? undefined : Number(unitPrice) })}>Add to job</Button></>}
          >
            <div className="grid gap-4">
              <Field label="Spare part" error={add.fieldErrors.productId}>{(p) => (
                <Select {...p} value={productId} onChange={(e) => { setProductId(e.target.value); const s = stock.find((x) => x.id === e.target.value); setUnitPrice(s?.price ? String(s.price) : ""); }}>
                  <option value="">Select part…</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code}) — {s.quantity} in stock</option>)}
                </Select>
              )}</Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Quantity" error={add.fieldErrors.quantity}>{(p) => <Input {...p} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
                <Field label={`Unit price (${job.currency})`} error={add.fieldErrors.unitPrice} help={picked && !picked.price ? "This part has no list price — enter one." : undefined}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />}</Field>
              </div>
              {picked && Number(quantity) > picked.quantity && <p className="text-xs font-medium text-red-600">Only {picked.quantity} in stock.</p>}
              <FormError error={add.error} />
            </div>
          </Dialog>
        )}
      />
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead className="bg-ink-50/60"><tr><th className="th">Part</th><th className="th text-right">Qty</th><th className="th text-right">Unit price</th><th className="th text-right">Line total</th>{editable && <th className="th w-10"><span className="sr-only">Remove</span></th>}</tr></thead>
          <tbody className="divide-y divide-ink-100">
            {parts.length === 0 && <tr><td colSpan={5} className="td text-ink-500">No parts used yet.</td></tr>}
            {parts.map((p) => (
              <tr key={p.id}>
                <td className="td"><span className="font-medium text-ink-900">{p.name}</span>{p.code && <span className="block font-mono text-xs text-ink-500">{p.code}</span>}</td>
                <td className="td text-right tabular-nums">{p.quantity}</td>
                <td className="td text-right tabular-nums">{fmtMoney(p.unitPrice, job.currency)}</td>
                <td className="td text-right font-medium tabular-nums">{fmtMoney(p.lineTotal, job.currency)}</td>
                {editable && <td className="td"><Button size="iconSm" variant="ghost" aria-label={`Remove ${p.name}`} loading={remove.pending} onClick={() => remove.run(job.id, p.id)}><Trash2 className="h-4 w-4" /></Button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-ink-200 text-sm">
            <tr><td colSpan={3} className="td text-right text-ink-500">Parts</td><td className="td text-right tabular-nums">{fmtMoney(job.partsTotal, job.currency)}</td>{editable && <td />}</tr>
            <tr><td colSpan={3} className="td text-right text-ink-500">Labour</td><td className="td text-right tabular-nums">{fmtMoney(job.labourCharge, job.currency)}</td>{editable && <td />}</tr>
            {job.discount > 0 && !job.isWarranty && <tr><td colSpan={3} className="td text-right text-ink-500">Discount</td><td className="td text-right tabular-nums">− {fmtMoney(job.discount, job.currency)}</td>{editable && <td />}</tr>}
            <tr><td colSpan={3} className="td text-right font-semibold text-ink-900">{job.isWarranty ? "Customer pays (warranty)" : "Total"}</td><td className="td text-right text-base font-bold tabular-nums">{fmtMoney(job.total, job.currency)}</td>{editable && <td />}</tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export function RaiseClaimButton({ jobCardId, parts }: { jobCardId: string; parts: PartLine[] }) {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState("");
  const [partId, setPartId] = useState("");
  const create = useAction(createWarrantyClaimAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open} onOpenChange={setOpen} title="Raise a warranty claim" description="You can review and submit it to YADEA from Warranty claims once the job is ready."
      trigger={<Button variant="secondary">Raise warranty claim</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button loading={create.pending} onClick={() => create.run({ jobCardId, jobCardPartId: partId || null, failureDescription: failure })}>Save claim</Button></>}
    >
      <div className="grid gap-4">
        <Field label="What failed?" error={create.fieldErrors.failureDescription}>{(p) => <Textarea {...p} rows={3} value={failure} onChange={(e) => setFailure(e.target.value)} />}</Field>
        <Field label="Claim" help="Claim the whole job, or just one part.">{(p) => (
          <Select {...p} value={partId} onChange={(e) => setPartId(e.target.value)}>
            <option value="">Labour and all parts</option>
            {parts.map((x) => <option key={x.id} value={x.id}>Only: {x.name} × {x.quantity}</option>)}
          </Select>
        )}</Field>
        <FormError error={create.error} />
      </div>
    </Dialog>
  );
}
