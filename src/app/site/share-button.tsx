"use client";
import { useEffect, useRef, useState } from "react";

/**
 * "Share this page": phones/tablets use the native share sheet; desktops get a small menu with
 * Copy link, WhatsApp, Facebook, X and Email (the desktop share sheet is unreliable and often shows nothing).
 */
export function ShareButton({ title, light }: { title: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const t = document.createElement("textarea");
      t.value = url; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* nothing more to try */ }
      t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  }

  async function onClick() {
    const url = window.location.href;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    setOpen((o) => !o);
  }

  const url = typeof window === "undefined" ? "" : window.location.href;
  const enc = encodeURIComponent;
  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100";
  return (
    <div ref={wrap} className="relative mt-5 inline-block">
      <button type="button" onClick={onClick} aria-expanded={open} aria-haspopup="menu" className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${light ? "border-neutral-900/30 text-neutral-900" : "border-white/60 text-white"}`}>
        {copied ? "Link copied" : "Share this page"}
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-2xl border border-neutral-200 bg-white p-1.5 text-left shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={() => { void copy(url); setOpen(false); }}>Copy link</button>
          <a role="menuitem" className={item} href={`https://wa.me/?text=${enc(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>WhatsApp</a>
          <a role="menuitem" className={item} href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Facebook</a>
          <a role="menuitem" className={item} href={`https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>X (Twitter)</a>
          <a role="menuitem" className={item} href={`mailto:?subject=${enc(title)}&body=${enc(url)}`} onClick={() => setOpen(false)}>Email</a>
        </div>
      )}
      <span aria-live="polite" className="sr-only">{copied ? "Link copied to clipboard" : ""}</span>
    </div>
  );
}
