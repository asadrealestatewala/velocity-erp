"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Scroll-driven motion layer for every public website page (home, models, blog, pages, showrooms...).
 * It decorates the server-rendered markup instead of requiring per-section changes, so new sections and
 * new workspaces get it automatically. Nothing is hidden until this script runs, and nothing runs under
 * prefers-reduced-motion. Styles live in site-motion.css and are scoped to `.sm-on`.
 *
 * Patterns: staggered scroll reveals, masked word-by-word headlines, image reveal, hero parallax,
 * count-up numbers, scroll progress bar, compact header on scroll, section dot navigator.
 */

const REVEAL = [
  "section h1", "section h2", "section h3",
  "section > div > p", "section > p", "section > div > div > p",
  "section .grid > *", "section .snap-x > *", "section details", "section li",
  "section .flex-wrap > a", "section form", "section blockquote", "section table",
  "footer .grid > *", "footer > p",
].join(",");
const IMAGES = "section img:not(.absolute)";
const COUNT_RE = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

type Dot = { id: string; label: string };
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SiteMotion() {
  const bar = useRef<HTMLDivElement>(null);
  const [dots, setDots] = useState<Dot[]>([]);
  const [active, setActive] = useState("");

  useIsoLayoutEffect(() => {
    // Visitors with "reduce motion" (Windows: animation effects off) get gentle fade-ins only: no movement, parallax, counters or progress bar.
    const lite = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.querySelector<HTMLElement>("[data-site-root]");
    if (!root) return;
    const cleanups: (() => void)[] = [];
    const inView = (el: Element) => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.95 && r.bottom > 0; };

    // 1. Headlines: split h1 into masked words that rise in one after another.
    if (!lite) root.querySelectorAll<HTMLElement>("h1").forEach((h) => {
      if (h.closest("[aria-roledescription=carousel]") || h.childElementCount > 0) return;
      const text = h.textContent?.trim() ?? "";
      if (!text) return;
      h.setAttribute("aria-label", text);
      h.textContent = "";
      text.split(/\s+/).forEach((w, i, all) => {
        const mask = document.createElement("span");
        mask.className = "sm-w"; mask.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.textContent = w; inner.style.setProperty("--sm-d", `${120 + i * 70}ms`);
        mask.append(inner); h.append(mask);
        if (i < all.length - 1) h.append(" ");
      });
      h.setAttribute("data-sm-h1", "");
    });

    // 2. Tag reveal targets (skip nested ones and anything inside a carousel/header).
    const all = Array.from(root.querySelectorAll<HTMLElement>(`${REVEAL},${IMAGES}`)).filter((el) =>
      !el.closest("header, [aria-roledescription=carousel], [data-sm-skip]") && !el.hasAttribute("data-sm-h1") && !el.hasAttribute("data-sm-nofx"));
    const set = new Set(all);
    const targets = all.filter((el) => { for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
    const seen = new Map<Element, number>();
    targets.forEach((el) => {
      const parent = el.parentElement!;
      const i = seen.get(parent) ?? 0; seen.set(parent, i + 1);
      const hero = el.closest("[data-sm-hero]") ? 380 : 0;
      el.style.setProperty("--sm-d", `${hero + Math.min(i, 7) * 80}ms`);
      el.setAttribute("data-sm", el.tagName === "IMG" ? "img" : "up");
    });
    root.classList.add("sm-on");
    root.classList.toggle("sm-lite", lite);

    // 3. Count-up numbers (stat tiles and impact figures).
    const counters = lite ? [] : Array.from(root.querySelectorAll<HTMLElement>("section dl dt, #impact .relative > p:first-child, [data-sm-count]"))
      .filter((el) => el.childElementCount === 0 && COUNT_RE.test(el.textContent ?? ""));
    const runCount = (el: HTMLElement) => {
      const m = COUNT_RE.exec(el.dataset.smFinal ?? "")!;
      const commas = m[2].includes(","); const dec = m[2].split(".")[1]?.length ?? 0;
      const end = parseFloat(m[2].replace(/,/g, "")); const t0 = performance.now(); const dur = 1500;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur); const v = end * (1 - Math.pow(1 - p, 4));
        const s = v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: commas });
        el.textContent = `${m[1]}${s}${m[3]}`;
        if (p < 1) requestAnimationFrame(tick); else el.textContent = el.dataset.smFinal!;
      };
      requestAnimationFrame(tick);
    };
    counters.forEach((el) => { el.dataset.smFinal = el.textContent ?? ""; });

    // 4. Reveal on scroll.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        el.classList.add("sm-in"); io.unobserve(el);
        if (el.dataset.smFinal) runCount(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    [...targets, ...counters].forEach((el) => { if (!el.hasAttribute("data-sm")) el.setAttribute("data-sm", "up"); io.observe(el); });
    root.querySelectorAll("[data-sm-h1]").forEach((h) => io.observe(h));
    cleanups.push(() => io.disconnect());

    // 5. Scroll: progress bar, compact header, hero parallax (one rAF-throttled listener).
    const header = root.querySelector("header");
    const setHeaderH = () => header && root.style.setProperty("--sm-header", `${header.offsetHeight}px`);
    if (!lite) { setHeaderH(); addEventListener("resize", setHeaderH); cleanups.push(() => removeEventListener("resize", setHeaderH)); }
    const specs = Array.from(root.querySelectorAll<HTMLElement>(".sm-spec"));
    const heroImg = root.querySelector<HTMLElement>("[data-sm-hero] img.absolute");
    const hero = root.querySelector<HTMLElement>("[data-sm-hero]");
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = scrollY; const max = document.documentElement.scrollHeight - innerHeight;
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        header?.classList.toggle("sm-scrolled", y > 8);
        // Scroll-scrubbed "expand" progress (0..1) for exploded-view style groups.
        specs.forEach((el) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty("--sm-p", String(Math.max(0, Math.min(1, (innerHeight * 0.9 - r.top) / (r.height * 0.8 + 1)))));
        });
        if (heroImg && hero && y < hero.offsetTop + hero.offsetHeight) heroImg.style.transform = `translate3d(0, ${(y - hero.offsetTop) * 0.14}px, 0) scale(1.06)`;
      });
    };
    if (!lite) {
      addEventListener("scroll", onScroll, { passive: true }); onScroll();
      cleanups.push(() => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); });
    }

    // 6. Section dot navigator (desktop) for sections that have an id.
    const secs = Array.from(root.querySelectorAll<HTMLElement>("section[id]"));
    if (!lite && secs.length > 1) {
      setDots(secs.map((s) => ({ id: s.id, label: s.querySelector("h2")?.textContent?.trim() || s.id })));
      const so = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: "-45% 0px -50% 0px" });
      secs.forEach((s) => so.observe(s)); cleanups.push(() => so.disconnect());
    }

    targets.forEach((el) => { if (inView(el)) el.classList.add("sm-in"); });
    return () => { cleanups.forEach((f) => f()); root.classList.remove("sm-on", "sm-lite"); };
  }, []);

  return (
    <>
      <div ref={bar} aria-hidden className="sm-progress" />
      {dots.length > 1 && (
        <nav aria-label="Page sections" className="sm-dots">
          {dots.map((d) => (
            <a key={d.id} href={`#${d.id}`} aria-label={d.label} title={d.label} aria-current={active === d.id ? "true" : undefined} />
          ))}
        </nav>
      )}
    </>
  );
}
