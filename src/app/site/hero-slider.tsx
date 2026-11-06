"use client";
import { useEffect, useRef, useState } from "react";

export type Slide = { image: string; link?: string; alt?: string };

/** Auto-advancing banner slider (scroll-snap, swipeable, with dots). Pauses when the tab is hidden or the user prefers reduced motion. */
export function HeroSlider({ slides, color }: { slides: Slide[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    const k = (n + slides.length) % slides.length;
    el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
    setI(k);
  };
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { if (!document.hidden) go(i + 1); }, 5000);
    return () => clearInterval(t);
  });
  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {slides.map((s, n) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={s.image} alt={s.alt ?? ""} className="block h-auto w-full" loading={n === 0 ? "eager" : "lazy"} decoding="async" />;
          return <div key={n} className="w-full shrink-0 snap-center">{s.link ? <a href={s.link}>{img}</a> : img}</div>;
        })}
      </div>
      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
          {slides.map((_, n) => (
            <button key={n} type="button" aria-label={`Show slide ${n + 1}`} onClick={() => go(n)} className="h-2.5 w-2.5 rounded-full border border-white" style={{ backgroundColor: n === i ? color : "rgba(255,255,255,.6)" }} />
          ))}
        </div>
      )}
    </div>
  );
}
