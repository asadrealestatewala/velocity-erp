"use client";
import { useRef, useState } from "react";
import { Pencil, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveProductAction, setBikePricesAction } from "@/server/actions/catalog";
export type ProductDraft = {
  sku: string; name: string; category: string | null; description: string | null; unit: string;
  price: number | null; dealerPrice: number | null; currency: string; isActive: boolean;
};

const EMPTY: ProductDraft = { sku: "", name: "", category: "", description: "", unit: "pcs", price: null, dealerPrice: null, currency: "PKR", isActive: true };

export function ProductDialog({ id, initial }: { id?: string; initial?: ProductDraft }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ProductDraft>(initial ?? EMPTY);
  const img = useRef<HTMLInputElement>(null);
  const { run, pending, fieldErrors } = useAction(saveProductAction, { onSuccess: () => { setOpen(false); if (!id) setV(EMPTY); } });
  const save = () => {
    const fd = new FormData();
    const f = img.current?.files?.[0];
    if (f) fd.set("image", f);
    run(id ?? null, v, fd);
  };
  const price = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(x));
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={id ? "Edit spare part" : "New spare part"}
      description="Enter official part data and prices only. Dealers see the dealer price when they order."
      trigger={id ? <Button size="iconSm" variant="ghost" aria-label={`Edit ${initial?.name}`}><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="h-4 w-4" /> New spare part</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={save}>Save</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Part name" required error={fieldErrors.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="SKU / part number" required error={fieldErrors.sku}>{(p) => <Input {...p} className="font-mono" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} />}</Field>
        <Field label="Category">{(p) => <Input {...p} placeholder="e.g. Brakes, Batteries, Tyres" value={v.category ?? ""} onChange={(e) => setV({ ...v, category: e.target.value })} />}</Field>
        <Field label="Unit">{(p) => <Input {...p} value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} />}</Field>
        <Field label="Retail price (PKR)" help="Optional — suggested price to customers" error={fieldErrors.price}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={price(v.price)} onChange={(e) => setV({ ...v, price: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
        <Field label="Dealer price (PKR)" help="Optional — what dealers pay YADEA" error={fieldErrors.dealerPrice}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={price(v.dealerPrice)} onChange={(e) => setV({ ...v, dealerPrice: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
        <Field label="Image" help="JPG, PNG or WEBP">{(p) => <input {...p} ref={img} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5" />}</Field>
        <div className="flex items-end"><Checkbox label="Active (inactive parts can't be ordered or stocked)" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /></div>
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

export function BikePriceDialog({ id, name, price, dealerPrice }: { id: string; name: string; price: number | null; dealerPrice: number | null }) {
  const [open, setOpen] = useState(false);
  const [retail, setRetail] = useState(price == null ? "" : String(price));
  const [dealer, setDealer] = useState(dealerPrice == null ? "" : String(dealerPrice));
  const { run, pending } = useAction(setBikePricesAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="sm"
      title={`Prices — ${name}`}
      description="Leave blank if the price isn't confirmed yet; procurement then prices the line when approving an order."
      trigger={<Button size="xs" variant="secondary"><Tag className="h-3.5 w-3.5" /> Set prices</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(id, { price: retail === "" ? null : Number(retail), dealerPrice: dealer === "" ? null : Number(dealer) })}>Save prices</Button></>}
    >
      <div className="grid gap-4">
        <Field label="Retail price (PKR)">{(p) => <Input {...p} type="number" min={0} step="0.01" value={retail} onChange={(e) => setRetail(e.target.value)} />}</Field>
        <Field label="Dealer price (PKR)" help="What dealers pay YADEA">{(p) => <Input {...p} type="number" min={0} step="0.01" value={dealer} onChange={(e) => setDealer(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
