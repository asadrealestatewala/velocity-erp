"use client";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

/** A one-off toast when the user's level is higher than the last level this browser saw. The first visit only records the level. */
export function LevelUp({ userId, level }: { userId: string; level: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const key = `yadea:level:${userId}`;
    try {
      const seen = Number(localStorage.getItem(key) ?? 0);
      localStorage.setItem(key, String(level));
      if (seen && level > seen) {
        setShow(true);
        const t = setTimeout(() => setShow(false), 6000);
        return () => clearTimeout(t);
      }
    } catch {
      /* storage unavailable — skip the toast */
    }
  }, [userId, level]);
  if (!show) return null;
  return (
    <div role="status" className="fixed right-4 bottom-4 z-50 flex max-w-sm animate-celebrate items-center gap-3 rounded-2xl border border-xp-100 bg-white p-4 shadow-[var(--shadow-pop)]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-xp-400 to-xp-600 text-white shadow-lg shadow-xp-500/40"><Sparkles className="h-6 w-6" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink-900">Level up — you&apos;re now level {level}</p>
        <p className="text-xs text-ink-500">Earned from your recorded activity.</p>
      </div>
      <button onClick={() => setShow(false)} aria-label="Dismiss" className="self-start text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>
    </div>
  );
}
