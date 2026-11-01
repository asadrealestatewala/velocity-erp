"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, CircleDollarSign, FilePlus2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { issueInvoiceAction, markInvoicePaidAction, voidInvoiceAction } from "@/server/actions/invoices";
import { requestReturnAction } from "@/server/actions/returns";
import { PAYMENT_METHOD_LABEL } from "@/lib/ops-constants";

/** Shown on a confirmed order that has no live invoice yet. */
export function IssueInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ taxRate: "18", buyerNtn: "", buyerCnic: "", buyerAddress: "", dueDate: "", notes: "" });
  const { run, pending, fieldErrors } = useAction(issueInvoiceAction, { onSuccess: (d) => { setOpen(false); if (d) router.push(`/portal/invoices/${d.id}`); } });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Issue tax invoice"
      description="Seller and buyer details are frozen on the invoice. Sales tax is charged on the order total after discount."
      trigger={<Button variant="secondary"><FilePlus2 className="h-4 w-4" /> Issue invoice</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run({ orderId, ...v, taxRate: Number(v.taxRate) || 0 })}>Issue invoice</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sales tax rate (%)" error={fieldErrors.taxRate} help="Use 0 for a non-taxable sale">{(p) => <Input {...p} type="number" min={0} max={100} step="0.01" value={v.taxRate} onChange={set("taxRate")} />}</Field>
        <Field label="Due date" error={fieldErrors.dueDate}>{(p) => <Input {...p} type="date" value={v.dueDate} onChange={set("dueDate")} />}</Field>
        <Field label="Buyer NTN" error={fieldErrors.buyerNtn} help="e.g. 1234567-8 (registered buyers)">{(p) => <Input {...p} value={v.buyerNtn} onChange={set("buyerNtn")} />}</Field>
        <Field label="Buyer CNIC" error={fieldErrors.buyerCnic} help="e.g. 35202-1234567-1 (unregistered buyers)">{(p) => <Input {...p} value={v.buyerCnic} onChange={set("buyerCnic")} />}</Field>
        <div className="sm:col-span-2"><Field label="Buyer address">{(p) => <Input {...p} value={v.buyerAddress} onChange={set("buyerAddress")} />}</Field></div>
        <div className="sm:col-span-2"><Field label="Notes">{(p) => <Textarea {...p} rows={2} value={v.notes} onChange={set("notes")} />}</Field></div>
      </div>
    </Dialog>
  );
}

export function InvoiceActions({ id, status, canManage, canReturn, lines }: {
  id: string; status: "ISSUED" | "PAID" | "VOID"; canManage: boolean; canReturn: boolean;
  lines: { id: string; name: string; available: number }[];
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [method, setMethod] = useState("Cash");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const pay = useAction(markInvoicePaidAction, { onSuccess: () => setPayOpen(false) });
  const voidIt = useAction(voidInvoiceAction, { onSuccess: () => setVoidOpen(false) });
  const ret = useAction(requestReturnAction, { onSuccess: () => { setRetOpen(false); setQty({}); setReason(""); } });
  if (status === "VOID") return null;
  const returnable = lines.filter((l) => l.available > 0);
  return (
    <div className="flex flex-wrap gap-2">
      {canManage && status === "ISSUED" && (
        <Dialog open={payOpen} onOpenChange={setPayOpen} size="sm" title="Record payment" description="Marks the invoice as paid in full."
          trigger={<Button><CircleDollarSign className="h-4 w-4" /> Mark paid</Button>}
          footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button loading={pay.pending} onClick={() => pay.run(id, method)}>Mark paid</Button></>}>
          <Field label="Paid by">{(p) => <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.values(PAYMENT_METHOD_LABEL).map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
        </Dialog>
      )}
      {canReturn && returnable.length > 0 && (
        <Dialog open={retOpen} onOpenChange={setRetOpen} title="Record a customer return" description="The return needs a manager's approval before stock and the refund are recorded."
          trigger={<Button variant="secondary"><Undo2 className="h-4 w-4" /> Customer return</Button>}
          footer={<><Button variant="secondary" onClick={() => setRetOpen(false)}>Cancel</Button><Button loading={ret.pending} onClick={() => ret.run({ invoiceId: id, reason, restock, lines: returnable.map((l) => ({ invoiceLineId: l.id, quantity: Number(qty[l.id]) || 0 })) })}>Submit return</Button></>}>
          <div className="space-y-3">
            {returnable.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_6rem] items-end gap-3">
                <span className="text-sm font-medium text-ink-900">{l.name}<span className="block text-xs font-normal text-ink-500">Up to {l.available} can be returned</span></span>
                <Field label="Qty">{(p) => <Input {...p} type="number" min={0} max={l.available} value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />}</Field>
              </div>
            ))}
            {ret.fieldErrors.lines && <p className="text-xs font-medium text-red-600">{ret.fieldErrors.lines}</p>}
            <Field label="Reason" error={ret.fieldErrors.reason}>{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            <Checkbox label="Items are resaleable — put them back into stock" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          </div>
        </Dialog>
      )}
      {canManage && (
        <Dialog open={voidOpen} onOpenChange={setVoidOpen} size="sm" title="Void this invoice?" description="Use this for an invoice raised in error. A voided invoice cannot be reopened; the order can then be re-invoiced or cancelled."
          trigger={<Button variant="secondary"><Ban className="h-4 w-4" /> Void</Button>}
          footer={<><Button variant="secondary" onClick={() => setVoidOpen(false)}>Keep invoice</Button><Button variant="danger" loading={voidIt.pending} onClick={() => voidIt.run(id, reason)}>Void invoice</Button></>}>
          <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </Dialog>
      )}
    </div>
  );
}
