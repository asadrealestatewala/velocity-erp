"use client";
import { useEffect, useState } from "react";

/** Shows its children (the bulk actions) only while at least one row checkbox named `name` is ticked. */
export function BulkBar({ name = "ids", children }: { name?: string; children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(document.querySelectorAll(`input[name="${name}"]:checked`).length);
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [name]);
  if (!count) return null;
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] px-3 py-2 text-[13px]" role="region" aria-label="Bulk actions">
      <span className="font-medium tabular-nums" aria-live="polite">{count} selected</span>
      {children}
    </div>
  );
}
