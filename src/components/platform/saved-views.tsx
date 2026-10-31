"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, X } from "lucide-react";

type View = { name: string; query: string };

/** Saved filters: remembers a named set of filters for this list in this browser (never sent to the server). */
export function SavedViews({ storageKey, label = "Saved filters" }: { storageKey: string; label?: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const query = sp.toString();
  const [views, setViews] = useState<View[]>([]);
  const [ready, setReady] = useState(false);
  const key = `pf-views:${storageKey}`;
  useEffect(() => {
    try { setViews(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { setViews([]); }
    setReady(true);
  }, [key]);
  const persist = (v: View[]) => { setViews(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable: views last for this visit */ } };
  const saved = views.find((v) => v.query === query);
  if (!ready || (!views.length && !query)) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]" aria-label={label} role="group">
      <span className="text-[var(--pf-muted)]">{label}:</span>
      {views.map((v) => (
        <span key={v.name} className={`inline-flex items-center rounded-full border ${v.query === query ? "border-[var(--pf-accent)] bg-[var(--pf-accent-soft)]" : "border-[var(--pf-border)]"}`}>
          <Link href={v.query ? `${path}?${v.query}` : path} className="py-0.5 pr-1 pl-2.5 font-medium">{v.name}</Link>
          <button type="button" aria-label={`Remove saved filter ${v.name}`} onClick={() => persist(views.filter((x) => x !== v))} className="rounded-full p-1 text-[var(--pf-muted)] hover:text-[var(--pf-text)]"><X className="size-3" aria-hidden /></button>
        </span>
      ))}
      {query && !saved && (
        <button type="button" onClick={() => { const name = window.prompt("Name this filter", ""); if (name?.trim()) persist([...views.filter((v) => v.name !== name.trim()), { name: name.trim(), query }]); }} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pf-border)] px-2.5 py-0.5 text-[var(--pf-muted)] hover:text-[var(--pf-text)]">
          <Bookmark className="size-3" aria-hidden />Save this filter
        </button>
      )}
    </div>
  );
}
