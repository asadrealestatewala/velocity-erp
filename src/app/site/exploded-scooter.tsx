"use client";
import { useEffect, useRef, useState } from "react";
import type { PartLabel } from "./scooter-scene";

const ss = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * Scroll-driven 3D exploded view of a stylised scooter (procedural three.js model, loaded lazily).
 * The model is an illustration, not the exact design of any Yadea product; labels come from real model specs.
 * Reduced-motion visitors get a static half-exploded view; without WebGL a plain spec list is shown.
 */
export function ExplodedScooter({ labels, name, color }: { labels: PartLabel[]; name: string; color: string }) {
  const section = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"loading" | "ready" | "fallback">("loading");
  const [still, setStill] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    let api: { render: (e: number, rot: number) => void; resize: () => void; dispose: () => void } | null = null;
    let started = false, visible = false, dead = false, raf = 0;
    const update = () => {
      raf = 0;
      if (!api || !section.current) return;
      if (reduce) { api.render(0.8, -0.25); return; }
      const r = section.current.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      const e = ss((t - 0.12) / 0.33) * (1 - ss((t - 0.6) / 0.3));
      api.render(e, -0.6 + 1.05 * t);
    };
    const queue = () => { if (!raf && visible) raf = requestAnimationFrame(update); };
    const init = async () => {
      try {
        const mod = await import("./scooter-scene");
        if (dead || !host.current) return;
        api = mod.createScooter(host.current, labels);
        setMode("ready"); update();
      } catch { if (!dead) setMode("fallback"); }
    };
    const io = new IntersectionObserver(([en]) => {
      visible = !!en?.isIntersecting;
      if (visible && !started) { started = true; void init(); }
      queue();
    }, { rootMargin: "300px 0px" });
    if (section.current) io.observe(section.current);
    const ro = new ResizeObserver(() => { api?.resize(); queue(); });
    if (host.current) ro.observe(host.current);
    addEventListener("scroll", queue, { passive: true });
    return () => { dead = true; io.disconnect(); ro.disconnect(); removeEventListener("scroll", queue); cancelAnimationFrame(raf); api?.dispose(); };
  }, [labels]);

  return (
    <section ref={section} id="exploded" data-sm-skip className="relative bg-white" style={{ height: still || mode === "fallback" ? undefined : "260vh" }}>
      <div className={still || mode === "fallback" ? "px-5 py-12" : "sticky overflow-hidden px-5 pt-8"} style={still || mode === "fallback" ? undefined : { top: "var(--sm-header, 3.6rem)", height: "calc(100svh - var(--sm-header, 3.6rem))" }}>
        <div className="mx-auto flex h-full max-w-6xl flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>{still ? "Inside the machine" : "Scroll to explode"}</p>
          <h2 className="mt-2 text-2xl font-extrabold sm:text-4xl">Inside the machine</h2>
          <p className="mt-1 text-xs text-neutral-500">Stylised 3D illustration, not the exact {name} design. Specs shown are the real {name} figures.</p>
          {mode !== "fallback" ? (
            <div ref={host} className="relative mt-2 min-h-0 flex-1" style={still ? { minHeight: 420 } : undefined} role="img" aria-label={`Exploded 3D illustration of an electric scooter with callouts: ${labels.map((l) => `${l.title} ${l.value}`).join(", ")}`} />
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {labels.map((l) => (
                <li key={l.title} className="rounded-2xl border border-neutral-200 p-4" style={{ borderLeft: `3px solid ${color}` }}>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{l.title}</p><p className="mt-1 text-lg font-bold">{l.value}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
