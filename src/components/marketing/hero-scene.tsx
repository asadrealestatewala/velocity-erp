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

// Fixed, non-overlapping slots around the stage (edges anchored so cards never collide).
const SLOTS = [
  "left-0 top-[2%]",
  "right-0 top-[2%]",
  "left-0 top-[22%]",
  "right-0 top-[22%]",
  "left-1/2 bottom-0 -translate-x-1/2",
];

/**
 * Hero visual: a lazily loaded three.js showroom (car + scooter turntable) with
 * orbiting ERP module cards. Falls back to the static product image when the
 * user prefers reduced motion, WebGL is unavailable, or loading fails.
 */
export function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);
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
          if (cancelled) return null;
          return startScene({ host, lowPower, carUrl: "/models/car-concept.glb", bikeUrl: "/brand/yadea-g5s.webp" });
        })
        .then((handle) => {
          if (!handle) return;
          if (cancelled) { handle.dispose(); return; }
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
    <div ref={hostRef} className="relative mx-auto aspect-[4/3] w-full max-w-xl" role="img" aria-label="A car and an electric scooter in a showroom, surrounded by ERP modules: inventory, sales, service, parts and finance">
      {!live && (
        <Image src="/brand/yadea-g5s.webp" alt="" width={640} height={480} className="absolute left-[15%] top-[12%] h-auto w-[70%] drop-shadow-2xl" priority />
      )}
      {MODULES.map((m, i) => (
        <div
          key={m.label}
          style={{ animationDelay: `${i * -1.1}s` }}
          className={`hero-float absolute z-10 flex items-center gap-2 rounded-xl border border-ink-100 bg-white/95 px-3 py-2 shadow-md ${SLOTS[i]}`}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><m.icon className="size-4" aria-hidden /></span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{m.label}</span>
            <span className="hidden text-xs text-ink-500 sm:block">{m.sub}</span>
          </span>
        </div>
      ))}
      {live && (
        <p className="absolute -bottom-5 right-0 text-[10px] text-ink-400">
          Car: &ldquo;Car Concept&rdquo; by Eric Chadwick, Darmstadt Graphics Group, <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
        </p>
      )}
    </div>
  );
}
