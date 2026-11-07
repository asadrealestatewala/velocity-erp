"use client";
import { useMemo, useState } from "react";

export type FaqItem = { q: string; a: string };

/** Interactive FAQ: search box, expand/collapse all, and one accordion row per question. */
export function FaqList({ items, contactHref }: { items: FaqItem[]; contactHref?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.map((x, i) => ({ ...x, i })).filter((x) => !t || `${x.q} ${x.a}`.toLowerCase().includes(t));
  }, [items, q]);
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const allOpen = shown.length > 0 && shown.every((x) => open.has(x.i));
  return (
    <div className="my-8 not-prose">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" aria-label="Search questions" placeholder="Search questions" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm" />
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((x) => x.i)))} className="rounded-full border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--site)", color: "var(--site)" }}>{allOpen ? "Collapse all" : "Expand all"}</button>
      </div>
      {shown.length === 0 ? <p className="mt-6 text-neutral-600">No questions match your search.</p> : (
        <ul className="mt-5 space-y-3">
          {shown.map((x) => {
            const isOpen = open.has(x.i);
            return (
              <li key={x.i} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm" style={isOpen ? { borderColor: "var(--site)" } : undefined}>
                <h3>
                  <button type="button" aria-expanded={isOpen} onClick={() => toggle(x.i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold leading-snug text-neutral-900">
                    <span>{x.q}</span>
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none text-white transition-transform" style={{ backgroundColor: "var(--site)", transform: isOpen ? "rotate(45deg)" : undefined }}>+</span>
                  </button>
                </h3>
                {isOpen && <div className="space-y-3 border-t border-neutral-100 px-5 py-4 text-[15px] leading-7 text-neutral-700">{x.a.split("\n\n").flatMap((p) => p.split(/\n(?=\s*contact us\s*$)/i)).map((p, k) =>
                  contactHref && /^\s*contact us\s*$/i.test(p)
                    ? <a key={k} href={contactHref} className="inline-block rounded-full px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "var(--site)" }}>Contact us</a>
                    : <p key={k} className="whitespace-pre-line">{p}</p>)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
