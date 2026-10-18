"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/misc";
import { createSalesOrderAction, searchCustomersAction } from "@/server/actions/sales-orders";
import { fmtMoney } from "@/lib/utils";

export type SellableItem = { key: string; kind: "BIKE" | "PART"; name: string; code: string; quantity: number; price: number | null; currency: string };
type Customer = { id: string; name: string; phone: string | null };
type Line = { key: string; itemKey: string; quantity: string; unitPrice: string };

let seq = 0;
const newLine = (): Line => ({ key: `l${++seq}`, itemKey: "", quantity: "1", unitPrice: "" });

export function SalesOrderForm({ dealershipId, items, initialCustomer, leadId }: { dealershipId: string; items: SellableItem[]; initialCustomer?: Customer; leadId?: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [customerName, setCustomerName] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"draft" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const currency = items[0]?.currency ?? "PKR";
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: string, itemKey: string) => {
    const it = byKey.get(itemKey);
    setLine(key, { itemKey, unitPrice: it?.price ? String(it.price) : "" });
  };
  const usedKeys = new Set(lines.map((l) => l.itemKey));
  // Requested quantity per item across all lines (the same item may be added twice).
  const requested = new Map<string, number>();
  for (const l of lines) if (l.itemKey) requested.set(l.itemKey, (requested.get(l.itemKey) ?? 0) + (Number(l.quantity) || 0));

  const submit = async (confirmNow: boolean) => {
    setBusy(confirmNow ? "confirm" : "draft");
    setError(null);
    setFieldErrors({});
    const res = await createSalesOrderAction(dealershipId, {
      contactId: customer?.id ?? null, leadId: leadId ?? null, customerName: customer ? null : customerName, notes, discount: Number(discount) || 0, confirmNow,
      lines: lines.filter((l) => l.itemKey).map((l) => ({ itemKey: l.itemKey, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
    });
    setBusy(null);
    if (res.ok) {
      toast.success(res.message ?? "Order saved.");
      router.push(`/portal/sales-orders/${(res.data as { id: string }).id}`);
      router.refresh();
    } else {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Customer" description="Link the order to a contact so it appears in their activity, or just type the customer's name." />
          <div className="p-5">
            {customer ? (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <UserRound className="h-5 w-5 text-brand-600" />
                  <div><p className="font-medium text-ink-900">{customer.name}</p>{customer.phone && <p className="text-xs text-ink-500">{customer.phone}</p>}</div>
                </div>
                {!initialCustomer && <Button size="iconSm" variant="ghost" aria-label="Remove customer" onClick={() => setCustomer(null)}><X className="h-4 w-4" /></Button>}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <CustomerSearch onPick={setCustomer} />
                <Field label="…or customer name" error={fieldErrors.customerName}>{(p) => <Input {...p} placeholder="Walk-in customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />}</Field>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Items" description="Only products with stock in your showroom can be added." />
          <div className="space-y-3 p-5">
            {lines.map((l) => {
              const it = byKey.get(l.itemKey);
              const over = it ? (requested.get(l.itemKey) ?? 0) > it.quantity : false;
              return (
                <div key={l.key} className="grid gap-2 rounded-lg border border-ink-200 p-3 sm:grid-cols-[1fr_6rem_9rem_auto] sm:items-end">
                  <Field label="Item">
                    {(p) => (
                      <Select {...p} value={l.itemKey} onChange={(e) => pick(l.key, e.target.value)}>
                        <option value="">Select item…</option>
                        {(["BIKE", "PART"] as const).map((kind) => {
                          const group = items.filter((i) => i.kind === kind);
                          if (!group.length) return null;
                          return (
                            <optgroup key={kind} label={kind === "BIKE" ? "Bike models" : "Spare parts"}>
                              {group.map((i) => <option key={i.key} value={i.key} disabled={usedKeys.has(i.key) && i.key !== l.itemKey}>{i.name} — {i.quantity} in stock</option>)}
                            </optgroup>
                          );
                        })}
                      </Select>
                    )}
                  </Field>
                  <Field label="Qty">{(p) => <Input {...p} type="number" min={1} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} aria-invalid={over || undefined} />}</Field>
                  <Field label={`Unit price (${currency})`}>{(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />}</Field>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="text-sm font-semibold tabular-nums text-ink-800 sm:hidden">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), currency)}</span>
                    <Button size="icon" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {over && it && <p className="text-xs font-medium text-red-600 sm:col-span-4">Only {it.quantity} in stock for {it.name}.</p>}
                </div>
              );
            })}
            {fieldErrors.lines && <p className="text-xs font-medium text-red-600">{fieldErrors.lines}</p>}
            <Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])} disabled={lines.length >= items.length}><Plus className="h-4 w-4" /> Add another item</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Summary" />
          <div className="space-y-4 p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="font-medium tabular-nums">{fmtMoney(subtotal, currency)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Discount</dt><dd><Input aria-label="Discount" type="number" min={0} step="0.01" inputMode="decimal" className="h-8 w-32 py-1 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} /></dd></div>
              <div className="flex justify-between border-t border-ink-100 pt-3 text-base"><dt className="font-semibold text-ink-900">Total</dt><dd className="font-bold tabular-nums">{fmtMoney(total, currency)}</dd></div>
            </dl>
            {fieldErrors.discount && <p className="text-xs font-medium text-red-600">{fieldErrors.discount}</p>}
            <Field label="Notes">{(p) => <Textarea {...p} rows={3} placeholder="Optional — delivery, payment terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
            <FormError error={error} />
            <div className="flex flex-col gap-2">
              <Button loading={busy === "confirm"} disabled={!!busy} onClick={() => submit(true)}>Confirm order &amp; deduct stock</Button>
              <Button variant="secondary" loading={busy === "draft"} disabled={!!busy} onClick={() => submit(false)}>Save as draft</Button>
            </div>
            <p className="text-xs text-ink-500">A draft does not change stock. Confirming deducts each item from your showroom inventory; cancelling a confirmed order puts it back.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CustomerSearch({ onPick }: { onPick: (c: Customer) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searched, setSearched] = useState(false);
  const seqRef = useRef(0);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const mine = ++seqRef.current;
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(q);
      if (mine !== seqRef.current) return;
      setResults(r.ok ? ((r.data ?? []) as Customer[]) : []);
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <Field label="Find an existing contact" help="Search by name, phone or email">
        {(p) => (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input {...p} className="pl-9" placeholder="Start typing…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Field>
      {searched && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-ink-200 bg-white py-1 shadow-[var(--shadow-pop)]">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">No matching contacts.</li>
          ) : (
            results.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-50" onClick={() => { onPick(c); setQ(""); setResults([]); }}>
                  <span className="font-medium text-ink-900">{c.name}</span>
                  <span className="text-xs text-ink-500">{c.phone}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
