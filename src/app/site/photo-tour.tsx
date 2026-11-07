"use client";
import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; title: string; value: string };

const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Scroll-driven tour of the real product photo: the camera glides across the actual bike, zooming
 * into each part with its real spec. Pin positions are fractions of the image. No illustration, no fake parts.
 * Reduced-motion visitors (and no-JS) get the photo with all pins and a plain spec list.
 */
export function PhotoTour({ src, name, points, color }: { src: string; name: string; points: Point[]; color: string }) {
  const section = useRef<HTMLElement>(null);
  const [still, setStill] = useState(false);
  const [view, setView] = useState({ x: 0.5, y: 0.5, s: 1, active: -1, a: 0 });
  const n = points.length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    if (reduce) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = section.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      const u = t * (n + 1);                       // 0 overview, 1..n parts, n+1 overview again
      const i0 = Math.min(n, Math.floor(u)), f = ease(u - i0);
      const at = (k: number) => (k <= 0 || k > n ? { x: 0.5, y: 0.5, s: 1 } : { x: points[k - 1]!.x, y: points[k - 1]!.y, s: 1.9 });
      const p0 = at(i0), p1 = at(i0 + 1);
      const near = Math.round(u);
      setView({ x: lerp(p0.x, p1.x, f), y: lerp(p0.y, p1.y, f), s: lerp(p0.s, p1.s, f), active: near >= 1 && near <= n ? near - 1 : -1, a: Math.min(1, Math.max(0, 1.6 - Math.abs(u - near) * 2.4)) });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", queue, { passive: true }); addEventListener("resize", queue);
    return () => { removeEventListener("scroll", queue); removeEventListener("resize", queue); cancelAnimationFrame(raf); };
  }, [n, points]);

  const lim = (view.s - 1) * 50;
  const tx = Math.max(-lim, Math.min(lim, (0.5 - view.x) * view.s * 100));
  const ty = Math.max(-lim, Math.min(lim, (0.5 - view.y) * view.s * 100));
  const cur = view.active >= 0 ? points[view.active] : undefined;

  return (
    <section ref={section} id="inside" data-sm-skip className="relative bg-white" style={{ height: still ? undefined : `${(n + 1) * 70 + 100}vh` }}>
      <div className={still ? "px-5 py-12" : "sticky overflow-hidden px-5"} style={still ? undefined : { top: "var(--sm-header, 3.6rem)", height: "calc(100svh - var(--sm-header, 3.6rem))" }}>
        <div className={`mx-auto flex max-w-5xl flex-col ${still ? "" : "h-full justify-center"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>{still ? "In detail" : "Scroll to explore"}</p>
          <h2 className="mt-2 text-2xl font-extrabold sm:text-4xl">Take a closer look: {name}</h2>
          {/* The card takes the full content width and keeps 4:3; on short screens it narrows so it never outgrows the viewport height. */}
          <div
            className="relative mx-auto mt-4 aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-200 bg-white"
            style={{ width: still ? "100%" : "min(100%, calc((100svh - var(--sm-header, 3.6rem) - 14rem) * 4 / 3))" }}
          >
            <div className="absolute inset-0 will-change-transform" style={still ? undefined : { transform: `translate(${tx}%, ${ty}%) scale(${view.s})` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${name} electric scooter`} className="absolute inset-0 h-full w-full object-contain" loading="lazy" decoding="async" />
              {points.map((p, i) => (
                <span key={p.title} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, opacity: still ? 1 : i === view.active ? 1 : 0.55 }}>
                  <span className="block h-3 w-3 rounded-full ring-4 ring-white/80" style={{ backgroundColor: color, transform: `scale(${(i === view.active ? 1.5 : 1) / (still ? 1 : view.s)})` }} />
                </span>
              ))}
            </div>
          </div>
          {/* Active callout sits under the photo (always visible on phones, fixed height so nothing jumps). */}
          {!still && (
            <div className="mx-auto mt-3 h-[5.25rem] w-full" style={{ maxWidth: "min(100%, calc((100svh - var(--sm-header, 3.6rem) - 14rem) * 4 / 3))" }} aria-hidden>
              {cur && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-md sm:p-4" style={{ borderLeft: `4px solid ${color}`, opacity: view.a, transform: `translateY(${(1 - view.a) * 10}px)` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{view.active + 1} / {n} · {cur.title}</p>
                  <p className="mt-1 text-lg font-bold text-neutral-900">{cur.value}</p>
                </div>
              )}
            </div>
          )}
          {still ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {points.map((p) => (<li key={p.title} className="rounded-2xl border border-neutral-200 p-4" style={{ borderLeft: `3px solid ${color}` }}><p className="text-xs uppercase tracking-wide text-neutral-500">{p.title}</p><p className="mt-1 text-lg font-bold">{p.value}</p></li>))}
            </ul>
          ) : (
            <ul className="sr-only">{points.map((p) => <li key={p.title}>{p.title}: {p.value}</li>)}</ul>
          )}
        </div>
      </div>
    </section>
  );
}
