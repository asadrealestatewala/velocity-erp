"use client";
import { useEffect } from "react";

/**
 * Privacy-first visit counter: no cookies, no IP, no identifiers. It only adds 1 to a per-day, per-page total, and it
 * does nothing at all when the browser sends Do Not Track or Global Privacy Control.
 */
export function PageHit({ path }: { path: string }) {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    try {
      void fetch("/api/analytics/hit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), keepalive: true });
    } catch {
      /* analytics must never affect the page */
    }
  }, [path]);
  return null;
}
