"use client";
import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";

/** A subtle, one-off celebration when a new badge was earned (shown once per badge per browser). */
export function Celebrate({ badge }: { badge: { id: string; name: string; description: string } | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!badge) return;
    try {
      const k = `celebrated:${badge.id}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, "1");
    } catch {
      /* storage unavailable — still show once this render */
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(t);
  }, [badge]);
  if (!show || !badge) return null;
  return (
    <div role="status" className="fixed right-4 bottom-4 z-50 flex max-w-sm animate-celebrate items-center gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-[var(--shadow-pop)]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/40"><Trophy className="h-6 w-6" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink-900">Badge unlocked: {badge.name}</p>
        <p className="text-xs text-ink-500">{badge.description}</p>
      </div>
      <button onClick={() => setShow(false)} aria-label="Dismiss" className="self-start text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>
      <span aria-hidden className="pointer-events-none absolute -top-2 left-6 text-lg">✨</span>
    </div>
  );
}
