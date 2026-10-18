"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { submitStockOrderAction } from "@/server/actions/procurement";
import { STOCK_STATE, stockState } from "@/lib/ops-constants";
import { cn, fmtMoney } from "@/lib/utils";

export type OrderableItem = {
  key: string;
  kind: "BIKE" | "PART";
  name: string;
  code: string;
  category: string | null;
  dealerPrice: number | null;
  currency: string;
  /** Current showroom stock and reorder level, so the dealer sees what they actually need. */
  inStock: number;
  reorderLevel: number;
};

export function StockOrderForm({ dealershipId, items, presetKeys = [] }: { dealershipId: string; items: OrderableItem[]; presetKeys?: string[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(presetKeys.map((k) => [k, "1"])));
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"BIKE" | "PART">(items.some((i) => i.kind === "BIKE") ? "BIKE" : "PART");
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = filter.trim().toLowerCase();
  const visible = items.filter((i) => i.kind === tab && (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q)));
  const chosen = items.filter((i) => Number(qty[i.key]) > 0);
  const priced = chosen.every((i) => i.dealerPrice != null);
  const total = chosen.reduce((s, i) => s + Number(qty[i.key]) * (i.dealerPrice ?? 0), 0);
  const currency = items[0]?.currency ?? "PKR";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await submitStockOrderAction(dealershipId, { priority, dealerNotes: notes, lines: chosen.map((i) => ({ itemKey: i.key, quantity: Number(qty[i.key]) })) });
    setBusy(false);
    if (res.ok) {
      toast.success(res.message ?? "Order sent.");
      router.push(`/portal/stock-orders/${(res.data as { id: string }).id}`);
      router.refresh();
    } else {
      setError(res.fieldErrors?.lines ?? res.error);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="What do you need?" description="Enter the quantity for each item you want YADEA to supply." />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Item type" className="inline-flex rounded-lg bg-ink-100 p-1 text-sm font-medium">
              {([["BIKE", "Bike models", Bike], ["PART", "Spare parts", Wrench]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex items-center gap-1.5 rounded-md px-3.5 py-1.5 transition", tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>
                  <Icon className="h-4 w-4" /> {label}
                  {chosen.some((c) => c.kind === k) && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] leading-5 text-white">{chosen.filter((c) => c.kind === k).length}</span>}
                </button>
              ))}
            </div>
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input aria-label="Filter items" className="h-9 pl-9" placeholder="Filter by name, code or category" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-500">{items.some((i) => i.kind === tab) ? "No items match your filter." : tab === "BIKE" ? "No bike models are available to order yet." : "No spare parts are in the catalogue yet."}</p>}
            {visible.map((i) => {
              const st = STOCK_STATE[stockState(i.inStock, i.reorderLevel)];
              return (
                <div key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{i.name}</p>
                    <p className="text-xs text-ink-500"><span className="font-mono">{i.code}</span>{i.category ? ` · ${i.category}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink-500">You have <b className="text-ink-800">{i.inStock}</b></span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="w-28 text-right tabular-nums text-ink-700">{i.dealerPrice != null ? fmtMoney(i.dealerPrice, i.currency) : <span className="text-xs text-ink-400">Price on approval</span>}</span>
                    <Input aria-label={`Quantity of ${i.name}`} type="number" min={0} inputMode="numeric" className="h-9 w-20 py-1 text-right" value={qty[i.key] ?? ""} placeholder="0" onChange={(e) => setQty({ ...qty, [i.key]: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Your order" />
        <div className="space-y-4 p-5">
          {chosen.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing selected yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {chosen.map((i) => (
                <li key={i.key} className="flex justify-between gap-3"><span className="truncate">{Number(qty[i.key])} × {i.name}</span><span className="tabular-nums text-ink-600">{i.dealerPrice != null ? fmtMoney(Number(qty[i.key]) * i.dealerPrice, i.currency) : "TBC"}</span></li>
              ))}
              <li className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><span>Estimated total</span><span className="tabular-nums">{fmtMoney(total, currency)}{!priced && " +"}</span></li>
            </ul>
          )}
          {!priced && chosen.length > 0 && <p className="text-xs text-ink-500">Some items have no catalogue price yet — procurement will confirm pricing when they approve the order.</p>}
          <Field label="Priority">{(p) => <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="NORMAL">Normal</option><option value="URGENT">Urgent — stock is running out</option></Select>}</Field>
          <Field label="Notes for procurement">{(p) => <Textarea {...p} rows={3} placeholder="Optional — preferred delivery timing, special instructions…" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <FormError error={error} />
          <Button className="w-full" loading={busy} disabled={chosen.length === 0} onClick={submit}>Send order to YADEA</Button>
          <p className="text-xs text-ink-500">Procurement reviews your order, confirms pricing and a delivery date, then dispatches it. You&apos;ll be notified at each step, and your stock increases when you confirm receipt.</p>
        </div>
      </Card>
    </div>
  );
}
