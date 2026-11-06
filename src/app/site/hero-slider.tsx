"use client";
import { useEffect, useState } from "react";

export type Slide = { src: string; href: string; alt: string };

/** Full-width banner slider: auto-advances, with arrows and dots. Pauses while hovered or focused. */
export function HeroSlider({ slides, color }: { slides: Slide[]; color: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, paused]);
  if (n === 0) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  return (
    <div className="relative overflow-hidden bg-black" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} role="region" aria-roledescription="carousel" aria-label="Banners">
      <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.src} alt={s.alt} className="block h-auto w-full" fetchPriority={k === 0 ? "high" : "low"} loading={k === 0 ? "eager" : "lazy"} decoding="async" />
          );
          return (
            <div key={s.src + k} className="w-full shrink-0" aria-hidden={k !== i} aria-roledescription="slide">
              {s.href ? <a href={s.href} tabIndex={k === i ? 0 : -1}>{img}</a> : img}
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="Previous banner" onClick={() => go(-1)} className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70 sm:grid">‹</button>
          <button type="button" aria-label="Next banner" onClick={() => go(1)} className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70 sm:grid">›</button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
            {slides.map((_, k) => (
              <button key={k} type="button" aria-label={`Banner ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className="h-2 rounded-full transition-all" style={{ width: k === i ? 22 : 8, backgroundColor: k === i ? color : "rgba(255,255,255,.6)" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
