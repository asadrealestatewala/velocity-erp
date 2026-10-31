import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export type Tab = { key: string; label: string; count?: number; href: string };

/** Status tabs with counts. The active tab is marked with aria-current. */
export function FilterTabs({ label, tabs, active }: { label: string; tabs: Tab[]; active: string }) {
  return (
    <nav aria-label={label} className="mb-3 flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${active === t.key ? "border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] font-semibold text-[var(--pf-accent)]" : "border-[var(--pf-border)] text-[var(--pf-muted)] hover:text-[var(--pf-text)]"}`}>
          {t.label}{t.count !== undefined && <span className="tabular-nums opacity-80">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A labelled search that keeps the other filters (passed as hidden fields) and offers a way to clear. */
export function SearchBox({ id, label, action, q, placeholder, keep, clearHref }: { id: string; label: string; action: string; q?: string; placeholder: string; keep?: Record<string, string | undefined>; clearHref?: string }) {
  return (
    <form className="mb-3 flex flex-wrap items-end gap-2" action={action} role="search">
      <div><label htmlFor={id} className="label">{label}</label><input id={id} name="q" defaultValue={q} placeholder={placeholder} className="input w-72 max-w-full" /></div>
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <button className={buttonClass("secondary", "md")} type="submit">Search</button>
      {q && clearHref && <Link href={clearHref} className="self-center text-[13px] text-[var(--pf-accent)] hover:underline">Clear search</Link>}
    </form>
  );
}
