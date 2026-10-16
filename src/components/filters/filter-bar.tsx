"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { format, startOfMonth, startOfQuarter, subDays } from "date-fns";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterDef =
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { type: "search"; name: string; label: string; placeholder?: string }
  | { type: "daterange"; from: string; to: string; label: string; presets?: boolean };

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** URL-driven filters: every change updates the query string, so filters are shareable and server-rendered. */
export function FilterBar({ filters, keep = [], className }: { filters: FilterDef[]; keep?: string[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showMobile, setShowMobile] = useState(false);

  const set = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  };

  const names = filters.flatMap((f) => (f.type === "daterange" ? [f.from, f.to] : [f.name]));
  const activeCount = names.filter((n) => params.get(n)).length;
  const clearAll = () => {
    const p = new URLSearchParams();
    for (const k of keep) if (params.get(k)) p.set(k, params.get(k)!);
    router.push(`${pathname}?${p.toString()}`);
  };

  const presets = [
    { label: "Today", from: iso(new Date()), to: iso(new Date()) },
    { label: "7d", from: iso(subDays(new Date(), 6)), to: iso(new Date()) },
    { label: "30d", from: iso(subDays(new Date(), 29)), to: iso(new Date()) },
    { label: "90d", from: iso(subDays(new Date(), 89)), to: iso(new Date()) },
    { label: "MTD", from: iso(startOfMonth(new Date())), to: iso(new Date()) },
    { label: "QTD", from: iso(startOfQuarter(new Date())), to: iso(new Date()) },
  ];

  return (
    <div className={cn("mb-4", className)}>
      <button
        className="mb-2 inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 md:hidden"
        onClick={() => setShowMobile((s) => !s)}
        aria-expanded={showMobile}
      >
        <Filter className="h-4 w-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-xs text-white">{activeCount}</span>}
      </button>
      <div className={cn("flex-wrap items-end gap-2 md:flex", showMobile ? "flex" : "hidden")}>
        {filters.map((f) => {
          if (f.type === "search")
            return (
              <form
                key={f.name}
                className="w-full md:w-64"
                onSubmit={(e) => {
                  e.preventDefault();
                  set({ [f.name]: (new FormData(e.currentTarget).get("v") as string).trim() || null });
                }}
              >
                <label className="sr-only" htmlFor={`f-${f.name}`}>{f.label}</label>
                <input id={`f-${f.name}`} name="v" defaultValue={params.get(f.name) ?? ""} placeholder={f.placeholder ?? f.label} className="input h-9 py-1.5" />
              </form>
            );
          if (f.type === "select")
            return (
              <div key={f.name} className="w-[calc(50%-4px)] md:w-auto">
                <label className="sr-only" htmlFor={`f-${f.name}`}>{f.label}</label>
                <select
                  id={`f-${f.name}`}
                  value={params.get(f.name) ?? ""}
                  onChange={(e) => set({ [f.name]: e.target.value || null })}
                  className={cn("input h-9 max-w-[220px] py-1.5 pr-8", params.get(f.name) && "border-brand-300 bg-brand-50/50 text-brand-800")}
                >
                  <option value="">{f.label}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          return (
            <div key={f.from} className="flex w-full flex-wrap items-center gap-1.5 md:w-auto">
              <span className="text-xs font-medium text-ink-500">{f.label}</span>
              <input type="date" aria-label={`${f.label} from`} value={params.get(f.from) ?? ""} onChange={(e) => set({ [f.from]: e.target.value || null })} className="input h-9 w-[140px] py-1.5" />
              <span className="text-ink-400">–</span>
              <input type="date" aria-label={`${f.label} to`} value={params.get(f.to) ?? ""} onChange={(e) => set({ [f.to]: e.target.value || null })} className="input h-9 w-[140px] py-1.5" />
              {f.presets && (
                <div className="flex gap-0.5 rounded-lg border border-ink-200 bg-white p-0.5">
                  {presets.map((p) => {
                    const on = params.get(f.from) === p.from && params.get(f.to) === p.to;
                    return (
                      <button key={p.label} onClick={() => set({ [f.from]: p.from, [f.to]: p.to })} className={cn("rounded-md px-2 py-1 text-xs font-medium", on ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {activeCount > 0 && (
          <button onClick={clearAll} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-900">
            <X className="h-4 w-4" /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
