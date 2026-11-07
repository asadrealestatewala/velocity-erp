"use client";
import { useEffect, useRef, useState } from "react";

export type PartKey = "top" | "front" | "wheel" | "body" | "rear" | "box";
export type Feature = { part: PartKey; title: string; value: string };

/**
 * The real product photo, cut along straight seams into six regions (polygons are % of the photo).
 * They drift apart as the visitor scrolls, then each spec is highlighted on the region that holds it.
 * No illustration and no invented parts: every label is a plain description of what the photo shows,
 * every value is a real spec. dx/dy are % of the photo, lx/ly is where the label sits on the piece.
 */
const PARTS: Record<PartKey, { clip: string; dx: number; dy: number; lx: number; ly: number; label: string }> = {
  top:   { clip: "0% 0%, 100% 0%, 100% 10%, 64% 10%, 64% 31%, 0% 31%", dx: -2, dy: -10, lx: 47, ly: 10, label: "Handlebar" },
  box:   { clip: "64% 10%, 100% 10%, 100% 34%, 64% 34%", dx: 8, dy: -10, lx: 74, ly: 24, label: "Top box" },
  front: { clip: "0% 31%, 51% 31%, 51% 53%, 0% 53%", dx: -11, dy: -4, lx: 38, ly: 42, label: "Headlamp" },
  wheel: { clip: "0% 53%, 45% 53%, 45% 100%, 0% 100%", dx: -12, dy: 8, lx: 42, ly: 84, label: "Front wheel" },
  body:  { clip: "51% 31%, 64% 31%, 64% 34%, 74% 34%, 74% 66%, 64% 68%, 58% 76%, 58% 100%, 45% 100%, 45% 53%, 51% 53%", dx: 0, dy: 5, lx: 62, ly: 52, label: "Body and battery" },
  rear:  { clip: "74% 34%, 100% 34%, 100% 100%, 58% 100%, 58% 76%, 64% 68%, 74% 66%", dx: 12, dy: 4, lx: 70, ly: 80, label: "Rear wheel" },
};
const ORDER = Object.keys(PARTS) as PartKey[];
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export function PhotoExplode({ src, name, features, color }: { src: string; name: string; features: Feature[]; color: string }) {
  const section = useRef<HTMLElement>(null);
  const [still, setStill] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [v, setV] = useState({ e: 0, active: -1, a: 0 });
  const n = features.length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    const mq = window.matchMedia("(max-width: 639px)");
    const setN = () => setNarrow(mq.matches);
    setN(); mq.addEventListener("change", setN);
    if (reduce) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = section.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      const e = ease((t - 0.04) / 0.26);            // 0 assembled → 1 exploded
      const u = Math.max(0, (t - 0.32) / 0.66) * n;  // feature steps
      const i = Math.min(n - 1, Math.floor(u));
      const f = u - i;
      setV({ e, active: u > 0 ? i : -1, a: u > 0 ? Math.min(1, Math.min(f, 1 - f) * 6 + 0.15) : 0 });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", queue, { passive: true }); addEventListener("resize", queue);
    return () => { removeEventListener("scroll", queue); removeEventListener("resize", queue); cancelAnimationFrame(raf); mq.removeEventListener("change", setN); };
  }, [n]);

  const cur = v.active >= 0 ? features[v.active] : undefined;
  const activePart = cur?.part;

  return (
    <section ref={section} id="inside" data-sm-skip className="relative bg-white" style={{ height: still ? undefined : `${n * 55 + 220}vh` }}>
      <div className={still ? "px-5 py-12" : "sticky overflow-hidden px-5"} style={still ? undefined : { top: "var(--sm-header, 3.6rem)", height: "calc(100svh - var(--sm-header, 3.6rem))" }}>
        <div className={`mx-auto flex max-w-5xl flex-col ${still ? "" : "h-full justify-center"}`}>
          <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color }}>{still ? "In detail" : "Scroll to explore"}</p>
          <h2 className="mt-2 text-2xl font-extrabold sm:text-4xl">Take a closer look: {name}</h2>
          <div className="relative mx-auto mt-4 aspect-square w-full overflow-hidden rounded-3xl border border-neutral-200 bg-white sm:aspect-[16/10]" style={still ? undefined : { maxWidth: "min(100%, calc((100svh - var(--sm-header, 3.6rem) - 14rem) * 1.6))" }}>
            <div className="absolute left-1/2 top-1/2" style={{ width: narrow ? "140%" : "100%", aspectRatio: "1586 / 992", transform: `translate(-50%, -50%) scale(${narrow ? 0.92 : 0.84})` }}>
              {/* faint outline of the assembled bike so the gaps read as "pulled apart" */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full" style={{ opacity: still ? 0 : 0.07 * v.e }} />
              {ORDER.map((k) => {
                const p = PARTS[k];
                const on = !activePart || activePart === k;
                return (
                  <div key={k} className="absolute inset-0 will-change-transform" style={still ? undefined : { transform: `translate(${p.dx * v.e * (narrow ? 0.5 : 1)}%, ${p.dy * v.e * (narrow ? 0.8 : 1)}%)`, opacity: on ? 1 : 0.55, filter: activePart === k ? `drop-shadow(0 0 7px ${color})` : v.e > 0.02 ? "drop-shadow(0 6px 8px rgba(0,0,0,.22))" : undefined, transition: "opacity .35s, filter .35s" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={k === "top" ? `${name} electric scooter` : ""} className="absolute inset-0 h-full w-full" style={{ clipPath: `polygon(${p.clip})` }} loading="lazy" decoding="async" />
                    {!still && (
                      <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow sm:text-xs" style={{ left: `${p.lx}%`, top: `${p.ly}%`, backgroundColor: color, opacity: Math.max(0, (v.e - 0.55) / 0.45) * (on ? 1 : 0.6), transform: `translate(-50%, -50%) scale(${activePart === k ? 1.12 : 1})` }}>
                        {p.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!still && (
            <div className="mx-auto mt-3 h-[5.25rem] w-full" style={{ maxWidth: "min(100%, calc((100svh - var(--sm-header, 3.6rem) - 14rem) * 1.6))" }} aria-hidden>
              {cur ? (
                <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-md sm:p-4" style={{ borderLeft: `4px solid ${color}`, opacity: v.a, transform: `translateY(${(1 - v.a) * 10}px)` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{v.active + 1} / {n} · {cur.title}</p>
                  <p className="mt-1 text-lg font-bold text-neutral-900">{cur.value}</p>
                </div>
              ) : (
                <p className="pt-2 text-sm font-medium text-neutral-500" style={{ opacity: v.e < 0.9 ? 1 : 0.6 }}>Keep scrolling: the {name} comes apart so you can see what is inside.</p>
              )}
            </div>
          )}
          {still ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((p) => (<li key={p.title} className="rounded-2xl border border-neutral-200 p-4" style={{ borderLeft: `3px solid ${color}` }}><p className="text-xs uppercase tracking-wide text-neutral-500">{p.title}</p><p className="mt-1 text-lg font-bold">{p.value}</p></li>))}
            </ul>
          ) : (
            <ul className="sr-only">{features.map((p) => <li key={p.title}>{p.title}: {p.value}</li>)}</ul>
          )}
        </div>
      </div>
    </section>
  );
}
