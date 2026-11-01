"use client";
import { useEffect, useRef, useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { searchServiceCustomersAction } from "@/server/actions/service-workshop";

export type PickedCustomer = { id: string; name: string; phone: string | null };

/** Link a booking or job card to an existing contact, or let the caller fall back to typing a name. */
export function CustomerPicker({ value, onChange, locked }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; locked?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedCustomer[]>([]);
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
      const r = await searchServiceCustomersAction(q);
      if (mine !== seqRef.current) return;
      setResults(r.ok ? ((r.data ?? []) as PickedCustomer[]) : []);
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-brand-600" />
          <div><p className="font-medium text-ink-900">{value.name}</p>{value.phone && <p className="text-xs text-ink-500">{value.phone}</p>}</div>
        </div>
        {!locked && <Button size="iconSm" variant="ghost" aria-label="Remove customer" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
      </div>
    );
  }
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
                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-50" onClick={() => { onChange(c); setQ(""); setResults([]); }}>
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
