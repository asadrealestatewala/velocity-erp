"use client";
import { useState } from "react";

/** Shares the current page with the device's share sheet, or copies its link. */
export function ShareButton({ title, light }: { title: string; light?: boolean }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { /* cancelled or blocked: nothing to do */ }
  }
  return (
    <button type="button" onClick={share} className={`mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${light ? "border-neutral-900/30 text-neutral-900" : "border-white/60 text-white"}`}>
      {done ? "Link copied" : "Share this page"}
    </button>
  );
}
