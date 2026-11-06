"use client";
import { useEffect, useRef, useState } from "react";

export type Slide = { src: string; href: string; alt: string };

/** Full-width banner slider: auto-advances, with arrows and dots. Pauses while hovered or focused. */
export function HeroSlider({ slides, color }: { slides: Slide[]; color: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const n = slides.length;
  // Slides can have different aspect ratios; size the frame to the widest one so no black bar shows under shorter images.
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const frame = useRef<HTMLDivElement>(null);
  // Images that finished loading before hydration never fire onLoad, so read them once on mount.
  useEffect(() => {
    frame.current?.querySelectorAll("img").forEach((el, k) => { if (el.complete && el.naturalWidth) setRatios((r) => ({ ...r, [k]: el.naturalWidth / el.naturalHeight })); });
  }, []);
  const ratio = Math.max(...Object.values(ratios), 0) || 16 / 7;
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, paused]);
  if (n === 0) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  return (
    <div ref={frame} className="relative overflow-hidden bg-black" style={{ aspectRatio: String(ratio) }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { setTouchX(e.touches[0]!.clientX); setPaused(true); }}
      onTouchEnd={(e) => { if (touchX !== null) { const dx = e.changedTouches[0]!.clientX - touchX; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } setTouchX(null); setPaused(false); }}
      role="region" aria-roledescription="carousel" aria-label="Banners">
      <div className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.src} alt={s.alt} className="block h-full w-full object-cover" onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h) setRatios((r) => (r[k] === w / h ? r : { ...r, [k]: w / h })); }} fetchPriority={k === 0 ? "high" : "low"} loading="eager" decoding="async" />
          );
          return (
            <div key={s.src + k} className="h-full w-full shrink-0" aria-hidden={k !== i} aria-roledescription="slide">
              {s.href ? <a href={s.href} tabIndex={k === i ? 0 : -1} className="block h-full">{img}</a> : img}
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
              <button key={k} type="button" aria-label={`Banner ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className="relative h-2 w-2 rounded-full p-0 transition-all after:absolute after:-inset-2 after:content-['']" style={{ minHeight: 0, minWidth: 0, height: 8, width: k === i ? 22 : 8, backgroundColor: k === i ? color : "rgba(255,255,255,.6)" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
