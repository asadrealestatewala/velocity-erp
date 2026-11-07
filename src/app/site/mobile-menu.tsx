"use client";

import { useEffect, useState } from "react";

export type MenuLink = { label: string; href: string };

/** Hamburger menu for small screens; the desktop nav is rendered by the layout. */
export function MobileMenu({ links, color }: { links: MenuLink[]; color: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-lg border border-neutral-200"
        style={{ color }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
      </button>
      {open && (
        <nav id="site-mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-neutral-200 bg-white shadow-lg">
          <ul className="divide-y divide-neutral-100">
            {links.map((l) => (
              <li key={l.label + l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block px-5 py-3.5 text-base font-medium">{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
