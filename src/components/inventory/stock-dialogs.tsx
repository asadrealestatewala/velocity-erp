"use client";
import { useEffect, useState } from "react";
import { History, Minus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { adjustStockAction, addStockItemAction, itemMovementsAction, setReorderLevelAction } from "@/server/actions/inventory";
import { INVENTORY_REASON } from "@/lib/ops-constants";
import { fmtDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";

export type CatalogOption = { key: string; kind: "BIKE" | "PART"; name: string; code: string };

export function AddStockItemDialog({ dealershipId, options }: { dealershipId: string; options: CatalogOption[] }) {
  const [open, setOpen] = useState(false);
  const [itemKey, setItemKey] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [note, setNote] = useState("");
  const { run, pending, fieldErrors } = useAction(addStockItemAction, { onSuccess: () => { setOpen(false); setItemKey(""); setQuantity("0"); setReorderLevel("0"); setNote(""); } });
  const bikes = options.filter((o) => o.kind === "BIKE");
  const parts = options.filter((o) => o.kind === "PART");
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Add item to showroom inventory"
      description="Pick a bike model or spare part you hold in your showroom and enter the quantity on hand today."
      trigger={<Button><Plus className="h-4 w-4" /> Add item</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(dealershipId, { itemKey, quantity: Number(quantity), reorderLevel: Number(reorderLevel), note })}>Add to inventory</Button></>}
    >
      {options.length === 0 ? (
        <p className="text-sm text-ink-600">Every available bike model and spare part is already in your inventory. YADEA adds new products to the catalogue as they are released.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item" required error={fieldErrors.itemKey} className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={itemKey} onChange={(e) => setItemKey(e.target.value)}>
                <option value="">Select a bike model or spare part…</option>
                {bikes.length > 0 && <optgroup label="Bike models">{bikes.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.code})</option>)}</optgroup>}
                {parts.length > 0 && <optgroup label="Spare parts">{parts.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.code})</option>)}</optgroup>}
              </Select>
            )}
          </Field>
          <Field label="Quantity on hand" required error={fieldErrors.quantity}>{(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
          <Field label="Reorder level" help="Managers are alerted at or below this quantity" error={fieldErrors.reorderLevel}>{(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />}</Field>
          <Field label="Note" className="sm:col-span-2">{(p) => <Input {...p} placeholder="Optional, e.g. opening stock count" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      )}
    </Dialog>
  );
}

export function AdjustStockDialog({ dealershipId, item }: { dealershipId: string; item: { id: string; name: string; quantity: number; reorderLevel: number } }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ADD" | "REMOVE" | "SET">("ADD");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<"ADJUSTMENT" | "RETURN" | "DAMAGE">("ADJUSTMENT");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState(String(item.reorderLevel));
  const { run, pending, fieldErrors } = useAction(adjustStockAction, { onSuccess: () => { setOpen(false); setNote(""); } });
  const levelAction = useAction(setReorderLevelAction, { success: "Reorder level saved." });
  // The reason list depends on the mode; never send a reason that does not belong to it.
  const effReason: "ADJUSTMENT" | "RETURN" | "DAMAGE" = mode === "ADD" ? (reason === "RETURN" ? "RETURN" : "ADJUSTMENT") : mode === "REMOVE" ? (reason === "DAMAGE" ? "DAMAGE" : "ADJUSTMENT") : "ADJUSTMENT";
  const target = mode === "SET" ? Number(quantity) : item.quantity + (mode === "ADD" ? 1 : -1) * Number(quantity);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="md"
      title={`Adjust stock — ${item.name}`}
      description={`Currently ${item.quantity} in stock. Every change is recorded in the item's history.`}
      trigger={<Button size="xs" variant="secondary"><Pencil className="h-3.5 w-3.5" /> Adjust</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={target < 0} onClick={() => run(dealershipId, { itemId: item.id, mode, quantity: Number(quantity), reason: effReason, note })}>Save change</Button></>}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Type of change" className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1 text-sm font-medium">
          {([["ADD", "Add stock", Plus], ["REMOVE", "Remove stock", Minus], ["SET", "Set count", Pencil]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition ${mode === m ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={mode === "SET" ? "Counted quantity" : "Quantity"} required error={fieldErrors.quantity}>{(p) => <Input {...p} type="number" min={mode === "SET" ? 0 : 1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
          {mode !== "SET" && (
            <Field label="Reason">
              {(p) => (
                <Select {...p} value={effReason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  <option value="ADJUSTMENT">Stock correction</option>
                  {mode === "ADD" && <option value="RETURN">Customer return</option>}
                  {mode === "REMOVE" && <option value="DAMAGE">Damaged / written off</option>}
                </Select>
              )}
            </Field>
          )}
          <Field label="Note" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
        <p className={`rounded-lg px-3 py-2 text-sm ${target < 0 ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-800"}`}>
          {target < 0 ? "That would take stock below zero." : <>New quantity: <b>{Number.isFinite(target) ? target : "—"}</b></>}
        </p>
        <div className="border-t border-ink-100 pt-3">
          <Field label="Reorder level" help="Managers are alerted at or below this quantity">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} type="number" min={0} inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} className="max-w-32" />
                <Button variant="secondary" size="sm" loading={levelAction.pending} onClick={() => levelAction.run(dealershipId, { itemId: item.id, reorderLevel: Number(level) })}>Save level</Button>
              </div>
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

type Movement = { id: string; at: string; delta: number; after: number; reason: string; note: string | null; by: string };

export function MovementsDialog({ dealershipId, item }: { dealershipId: string; item: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setError(null);
    itemMovementsAction(dealershipId, item.id).then((r) => {
      if (!alive) return;
      if (r.ok) setRows((r.data ?? []) as Movement[]);
      else setError(r.error);
    });
    return () => { alive = false; };
  }, [open, dealershipId, item.id]);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={`Stock history — ${item.name}`}
      description="Most recent 100 changes. Entries are permanent; corrections are recorded as new entries."
      trigger={<Button size="xs" variant="ghost" aria-label={`Stock history for ${item.name}`}><History className="h-3.5 w-3.5" /> History</Button>}
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !rows ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">No stock movements yet.</p>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-ink-50/60"><tr><th className="th">When</th><th className="th">Change</th><th className="th text-right">Qty</th><th className="th text-right">After</th><th className="th">By</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="td whitespace-nowrap text-xs">{fmtDateTime(m.at)}</td>
                  <td className="td">{INVENTORY_REASON[m.reason] ?? m.reason}{m.note && <p className="text-xs text-ink-400">{m.note}</p>}</td>
                  <td className="td text-right tabular-nums"><Badge tone={m.delta > 0 ? "green" : "red"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Badge></td>
                  <td className="td text-right tabular-nums">{m.after}</td>
                  <td className="td text-xs">{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
