"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { format, startOfMonth, startOfQuarter, subDays } from "date-fns";
import { ChevronDown, Filter, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterDef =
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { type: "search"; name: string; label: string; placeholder?: string }
  | { type: "daterange"; from: string; to: string; label: string; presets?: boolean };

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * URL-driven filters: every change updates the query string, so filters are shareable and server-rendered.
 * With `primary` set, the search box and the first `primary` selects stay inline and the rest live in a collapsible
 * "More filters" panel; active filters are always listed as removable chips.
 */
export function FilterBar({ filters, keep = [], className, primary }: { filters: FilterDef[]; keep?: string[]; className?: string; primary?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showMore, setShowMore] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  };

  const names = filters.flatMap((f) => (f.type === "daterange" ? [f.from, f.to] : [f.name]));
  const activeCount = names.filter((n) => params.get(n)).length;
  const clearAll = () => {
    const p = new URLSearchParams();
    for (const k of keep) if (params.get(k)) p.set(k, params.get(k)!);
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  };

  const presets = [
    { label: "Today", from: iso(new Date()), to: iso(new Date()) },
    { label: "7d", from: iso(subDays(new Date(), 6)), to: iso(new Date()) },
    { label: "30d", from: iso(subDays(new Date(), 29)), to: iso(new Date()) },
    { label: "90d", from: iso(subDays(new Date(), 89)), to: iso(new Date()) },
    { label: "MTD", from: iso(startOfMonth(new Date())), to: iso(new Date()) },
    { label: "QTD", from: iso(startOfQuarter(new Date())), to: iso(new Date()) },
  ];

  const grouped = primary !== undefined;
  const searchDef = filters.find((f): f is Extract<FilterDef, { type: "search" }> => f.type === "search");
  const rest = filters.filter((f) => f !== searchDef);
  const inline = grouped ? rest.slice(0, primary) : rest;
  const more = grouped ? rest.slice(primary) : [];
  const moreActive = more.flatMap((f) => (f.type === "daterange" ? [f.from, f.to] : [f.name])).filter((n) => params.get(n)).length;

  // Chips for every active filter (grouped mode only — the dashboard keeps its compact bar).
  const chips = grouped
    ? filters.flatMap((f) => {
        if (f.type === "search") return params.get(f.name) ? [{ key: f.name, label: `Search: “${params.get(f.name)}”`, clear: { [f.name]: null } }] : [];
        if (f.type === "select") {
          const v = params.get(f.name);
          const o = f.options.find((x) => x.value === v);
          return v ? [{ key: f.name, label: o ? `${f.label.replace(/^(Any|All) /, "").replace(/^./, (c) => c.toUpperCase())}: ${o.label}` : f.label, clear: { [f.name]: null } }] : [];
        }
        const a = params.get(f.from);
        const b = params.get(f.to);
        return a || b ? [{ key: f.from, label: `${f.label}: ${a ?? "…"} → ${b ?? "…"}`, clear: { [f.from]: null, [f.to]: null } }] : [];
      })
    : [];

  const renderSelect = (f: Extract<FilterDef, { type: "select" }>) => (
    <div key={f.name} className={cn("w-[calc(50%-4px)] md:w-auto", grouped && "md:min-w-[150px]")}>
      <label className="sr-only" htmlFor={`f-${f.name}`}>{f.label}</label>
      <select
        id={`f-${f.name}`}
        value={params.get(f.name) ?? ""}
        onChange={(e) => set({ [f.name]: e.target.value || null })}
        className={cn("input h-10 w-full max-w-[220px] py-1.5 pr-8 text-sm", params.get(f.name) && "border-brand-300 bg-brand-50/60 font-medium text-brand-800")}
      >
        <option value="">{f.label}</option>
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const renderDate = (f: Extract<FilterDef, { type: "daterange" }>) => (
    <div key={f.from} className="flex w-full flex-wrap items-center gap-1.5 md:w-auto">
      <span className="text-xs font-medium text-ink-500">{f.label}</span>
      <input type="date" aria-label={`${f.label} from`} value={params.get(f.from) ?? ""} onChange={(e) => set({ [f.from]: e.target.value || null })} className="input h-10 w-[140px] py-1.5" />
      <span className="text-ink-400">–</span>
      <input type="date" aria-label={`${f.label} to`} value={params.get(f.to) ?? ""} onChange={(e) => set({ [f.to]: e.target.value || null })} className="input h-10 w-[140px] py-1.5" />
      {f.presets && (
        <div className="flex gap-0.5 rounded-lg border border-ink-200 bg-white p-0.5">
          {presets.map((p) => {
            const on = params.get(f.from) === p.from && params.get(f.to) === p.to;
            return (
              <button key={p.label} onClick={() => set({ [f.from]: p.from, [f.to]: p.to })} className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", on ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100")}>
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const render = (f: FilterDef) => (f.type === "select" ? renderSelect(f) : f.type === "daterange" ? renderDate(f) : null);

  return (
    <div className={cn("mb-4", className)}>
      <div className={cn(grouped ? "card p-3 sm:p-4" : "")}>
        <div className="flex flex-wrap items-center gap-2">
          {searchDef && <SearchBox def={searchDef} value={params.get(searchDef.name) ?? ""} pending={pending} onChange={(v) => set({ [searchDef.name]: v || null })} />}
          {grouped && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 transition hover:bg-ink-50 md:hidden"
              onClick={() => setShowMore((s) => !s)}
              aria-expanded={showMore}
            >
              <Filter className="h-4 w-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeCount}</span>}
            </button>
          )}
          <div className={cn("flex-wrap items-center gap-2 md:flex", grouped ? (showMore ? "flex w-full" : "hidden") : "flex")}>
            {inline.map(render)}
            {grouped && more.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMore((s) => !s)}
                aria-expanded={showMore}
                aria-controls="more-filters"
                className="hidden h-10 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 transition hover:bg-ink-50 md:inline-flex"
              >
                <Filter className="h-4 w-4" /> More filters
                {moreActive > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{moreActive}</span>}
                <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
              </button>
            )}
            {activeCount > 0 && (
              <button onClick={clearAll} className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900">
                <X className="h-4 w-4" /> Clear all
              </button>
            )}
          </div>
        </div>
        {grouped && more.length > 0 && showMore && (
          <div id="more-filters" className="reveal mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">{more.map(render)}</div>
        )}
        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <button onClick={() => set(c.clear)} className="group inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100" aria-label={`Remove filter ${c.label}`}>
                  {c.label}
                  <X className="h-3 w-3 opacity-60 group-hover:opacity-100" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Search with an icon, instant (debounced) apply, a clear button and loading feedback. Enter applies immediately. */
function SearchBox({ def, value, pending, onChange }: { def: Extract<FilterDef, { type: "search" }>; value: string; pending: boolean; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    setText(value);
    last.current = value;
  }, [value]);
  useEffect(() => {
    if (text.trim() === last.current) return;
    const t = setTimeout(() => {
      last.current = text.trim();
      onChange(text.trim());
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <form
      role="search"
      className="relative min-w-[220px] flex-1 md:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        last.current = text.trim();
        onChange(text.trim());
      }}
    >
      <label className="sr-only" htmlFor={`f-${def.name}`}>{def.label}</label>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        id={`f-${def.name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={def.placeholder ?? def.label}
        autoComplete="off"
        className="input h-10 pr-9 pl-10"
      />
      <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Searching" />
        ) : text ? (
          <button type="button" onClick={() => { setText(""); last.current = ""; onChange(""); }} aria-label="Clear search" className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </form>
  );
}
