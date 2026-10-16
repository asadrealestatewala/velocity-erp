"use client";
import { useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveBikeModelAction, type BikeModelInput } from "@/server/actions/bike-models";

export function ModelDialog({ id, initial }: { id?: string; initial?: BikeModelInput }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<BikeModelInput>(initial ?? { name: "", code: "", availability: "AVAILABLE", specifications: {}, price: null, currency: "PKR", displayOrder: 0, isActive: true });
  const [specs, setSpecs] = useState<[string, string][]>(Object.entries((initial?.specifications ?? {}) as Record<string, string>).filter(([k]) => k !== "note"));
  const img = useRef<HTMLInputElement>(null);
  const { run, pending, fieldErrors } = useAction(saveBikeModelAction, { onSuccess: () => setOpen(false) });
  const save = () => {
    const fd = new FormData();
    const f = img.current?.files?.[0];
    if (f) fd.set("image", f);
    run(id ?? null, { ...v, specifications: Object.fromEntries(specs.filter(([k]) => k.trim())) }, fd);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={id ? <Button size="iconSm" variant="ghost" aria-label={`Edit ${initial?.name}`}><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="h-4 w-4" /> New model</Button>}
      title={id ? "Edit bike model" : "New bike model"}
      description="Enter official product data only. Public forms list active models automatically."
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={save}>Save</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model name" required error={fieldErrors.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Model code" required error={fieldErrors.code}>{(p) => <Input {...p} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Category">{(p) => <Input {...p} placeholder="e.g. E-Moped" value={v.category ?? ""} onChange={(e) => setV({ ...v, category: e.target.value })} />}</Field>
        <Field label="Availability">{(p) => <Select {...p} value={v.availability} onChange={(e) => setV({ ...v, availability: e.target.value as BikeModelInput["availability"] })}><option value="AVAILABLE">Available</option><option value="COMING_SOON">Coming soon</option><option value="OUT_OF_STOCK">Out of stock</option><option value="DISCONTINUED">Discontinued (hidden from forms)</option></Select>}</Field>
        <Field label="Price" help="Optional, administrator-entered" error={fieldErrors.price}>{(p) => <Input {...p} type="number" min={0} value={v.price == null ? "" : String(v.price)} onChange={(e) => setV({ ...v, price: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
        <Field label="Currency">{(p) => <Input {...p} maxLength={3} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Display order">{(p) => <Input {...p} type="number" min={0} value={String(v.displayOrder ?? 0)} onChange={(e) => setV({ ...v, displayOrder: Number(e.target.value) })} />}</Field>
        <Field label="Image" help="JPG, PNG or WEBP">{(p) => <input {...p} ref={img} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5" />}</Field>
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="sm:col-span-2">
          <p className="label">Specifications</p>
          <div className="space-y-1.5">
            {specs.map(([k, val], i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Specification name" placeholder="e.g. Range" value={k} onChange={(e) => setSpecs(specs.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} />
                <Input aria-label="Specification value" placeholder="Value" value={val} onChange={(e) => setSpecs(specs.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} />
                <Button size="icon" variant="ghost" aria-label="Remove specification" onClick={() => setSpecs(specs.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="xs" variant="secondary" onClick={() => setSpecs([...specs, ["", ""]])}><Plus className="h-3 w-3" /> Add specification</Button>
          </div>
        </div>
        <Checkbox className="sm:col-span-2" label="Active (deactivating hides it from forms but keeps it on historical leads and bookings)" checked={v.isActive ?? true} onChange={(e) => setV({ ...v, isActive: e.target.checked })} />
      </div>
    </Dialog>
  );
}
