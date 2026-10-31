"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Boxes, Wrench, Receipt, ShoppingCart, Cog } from "lucide-react";

const MODULES = [
  { icon: Boxes, label: "Inventory", sub: "Bikes and cars" },
  { icon: ShoppingCart, label: "Sales", sub: "Leads to orders" },
  { icon: Wrench, label: "Service", sub: "Job cards" },
  { icon: Cog, label: "Parts", sub: "Stock and reorder" },
  { icon: Receipt, label: "Finance", sub: "Ledger and vouchers" },
];

// Static positions used for the fallback and until the 3D scene takes over.
const STATIC_POS = [
  { left: "14%", top: "18%" },
  { left: "84%", top: "20%" },
  { left: "90%", top: "58%" },
  { left: "50%", top: "90%" },
  { left: "8%", top: "62%" },
];

/**
 * Hero visual: a lazily loaded three.js showroom (car + scooter turntable) with
 * orbiting ERP module cards. Falls back to the static product image when the
 * user prefers reduced motion, WebGL is unavailable, or loading fails.
 */
export function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let canvas = document.createElement("canvas");
    if (!(canvas.getContext("webgl2") || canvas.getContext("webgl"))) return;
    canvas = null as never;

    let dispose: (() => void) | undefined;
    let cancelled = false;
    const lowPower = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;

    const start = () => {
      import("./hero-scene-engine")
        .then(({ startScene }) => {
          if (cancelled) return;
          const cards = cardRefs.current.filter((c): c is HTMLDivElement => !!c);
          const handle = startScene({ host, cards, lowPower });
          dispose = handle.dispose;
          setLive(true);
        })
        .catch(() => {});
    };
    // Load once the hero is near the viewport and the browser is idle.
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 1500 });
      else setTimeout(start, 200);
    }, { rootMargin: "200px" });
    io.observe(host);

    return () => {
      cancelled = true;
      io.disconnect();
      dispose?.();
      setLive(false);
    };
  }, []);

  return (
    <div ref={hostRef} className="relative mx-auto aspect-[4/3] w-full max-w-xl" role="img" aria-label="A car and an electric scooter on a showroom turntable, surrounded by ERP modules: inventory, sales, service, parts and finance">
      {!live && (
        <Image src="/brand/yadea-g5s.webp" alt="" width={640} height={480} className="absolute inset-x-[15%] inset-y-[10%] h-auto w-[70%] drop-shadow-2xl" priority />
      )}
      {MODULES.map((m, i) => (
        <div
          key={m.label}
          ref={(el) => { cardRefs.current[i] = el; }}
          style={live ? undefined : { ...STATIC_POS[i], transform: "translate(-50%,-50%)" }}
          className="absolute flex items-center gap-2 rounded-xl border border-ink-100 bg-white/90 px-3 py-2 shadow-md will-change-transform"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><m.icon className="size-4" aria-hidden /></span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{m.label}</span>
            <span className="hidden text-xs text-ink-500 sm:block">{m.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
