"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Boxes, Wrench, Receipt, ShoppingCart, Cog } from "lucide-react";

const MODULES = [
  { icon: Boxes, label: "Inventory", sub: "Bikes and cars" },
  { icon: ShoppingCart, label: "Sales", sub: "Leads to orders" },
  { icon: Wrench, label: "Service", sub: "Job cards" },
  { icon: Cog, label: "Parts", sub: "Stock and reorder" },
  { icon: Receipt, label: "Finance", sub: "Ledger and vouchers" },
];

// Fixed, non-overlapping slots around the bike (edges anchored so cards never collide).
const SLOTS = [
  "left-0 top-[4%]",
  "right-0 top-[4%]",
  "left-0 bottom-[16%]",
  "right-0 bottom-[16%]",
  "left-1/2 bottom-0 -translate-x-1/2",
];

/**
 * Hero visual: the real product photo with a soft glow, ground shadow and a gentle pointer tilt,
 * surrounded by floating ERP module cards. No JS runs for touch devices or when the user prefers
 * reduced motion; the layout is identical, just still.
 */
export function HeroScene() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      stage.style.setProperty("--tilt-y", `${x * 7}deg`);
      stage.style.setProperty("--tilt-x", `${-y * 4}deg`);
      stage.style.setProperty("--shift-x", `${x * 10}px`);
    };
    const onLeave = () => {
      stage.style.setProperty("--tilt-y", "0deg");
      stage.style.setProperty("--tilt-x", "0deg");
      stage.style.setProperty("--shift-x", "0px");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={stageRef} className="relative mx-auto aspect-[4/3] w-full max-w-xl [perspective:900px]" role="img" aria-label="An electric scooter surrounded by ERP modules: inventory, sales, service, parts and finance">
      {/* glow and ground shadow */}
      <div aria-hidden className="absolute left-1/2 top-[48%] size-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(238_108_0/0.18),transparent)]" />
      <div aria-hidden className="absolute bottom-[26%] left-1/2 h-[7%] w-[56%] -translate-x-1/2 rounded-[50%] bg-ink-900/25 blur-xl" />
      <div
        className="hero-bike absolute left-[16%] top-[17%] w-[68%]"
        style={{ transform: "translateX(var(--shift-x,0px)) rotateY(var(--tilt-y,0deg)) rotateX(var(--tilt-x,0deg))" }}
      >
        <Image src="/brand/yadea-g5s.webp" alt="" width={1400} height={886} sizes="(min-width: 1024px) 400px, 70vw" className="h-auto w-full drop-shadow-2xl" priority />
      </div>
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
    </div>
  );
}
