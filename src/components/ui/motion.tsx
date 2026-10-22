"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts a formatted figure up from zero when it scrolls into view ("1,284", "PKR 4,500,000", "37%").
 * The server always renders the real value, so with JS off, reduced motion or an unparseable string
 * the user sees the genuine number — the animation only ever changes how the number arrives, never what it is.
 */
export function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const m = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);

  useIsoLayoutEffect(() => {
    // Hidden tabs throttle animation frames, so show the real number straight away instead of a stalled count.
    if (!m || reducedMotion() || document.hidden) return;
    const [, prefix, digits, suffix] = m;
    const target = Number(digits!.replace(/,/g, ""));
    if (!Number.isFinite(target) || Math.abs(target) < 2) return;
    const decimals = digits!.includes(".") ? digits!.split(".")[1]!.length : 0;
    const grouped = digits!.includes(",");
    const fmt = (n: number) => `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })}${suffix}`;
    setText(fmt(0));
    let raf = 0;
    let settle = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        setText(p >= 1 ? value : fmt(target * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // Whatever the frame scheduler does, the exact figure is on screen when the animation should be over.
      settle = window.setTimeout(() => setText(value), duration + 250);
    };
    const el = ref.current;
    const r = el?.getBoundingClientRect();
    const onScreen = !!r && r.top < window.innerHeight && r.bottom > 0;
    // Figures already in view start counting at once; the rest wait until they scroll into view.
    const io = !onScreen && el && "IntersectionObserver" in window ? new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (run(), io!.disconnect())) : null;
    if (io && el) io.observe(el);
    else run();
    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      setText(value);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span ref={ref}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}

/** A progress fill that grows from empty when it first appears (width is the real percentage). */
export function GrowBar({ pct, color, className }: { pct: number; color?: string; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return setOn(true);
    const id = window.setTimeout(() => setOn(true), 40);
    return () => clearTimeout(id);
  }, []);
  return <div className={className} style={{ width: `${on ? pct : 0}%`, background: color ?? "var(--color-brand-500)", transition: "width 900ms var(--ease-out-expo)" }} />;
}

/** Circular progress that sweeps from empty to the real percentage. */
export function ProgressRing({ pct, size = 112, stroke = 10, color = "var(--color-brand-600)", track = "var(--color-ink-100)", children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return setOn(true);
    const id = window.setTimeout(() => setOn(true), 60);
    return () => clearTimeout(id);
  }, []);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(clamped)}% complete`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={on ? c * (1 - clamped / 100) : c}
          style={{ transition: "stroke-dashoffset 1000ms var(--ease-out-expo)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
