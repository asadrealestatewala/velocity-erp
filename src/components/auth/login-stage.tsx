"use client";
import Image from "next/image";
import Link from "next/link";
import { useScene, type ScenePhase } from "./auth-scene";

const STATUS: Record<ScenePhase, string> = {
  idle: "Ready to sign in",
  submitting: "Verifying credentials…",
  success: "Access granted",
  error: "Sign-in failed — try again",
};

/**
 * The branded half of the sign-in page. The bike is the supplied YADEA G5S photograph, cut out from its
 * white studio background (public/brand/yadea-g5s.webp) — the real pixels, not a redraw. It is a single flat
 * photo, so the motion is image-based: a glide-in with natural deceleration, a reflection and ground glow, light
 * streaks and a light sweep. Independent wheel rotation or true 3D would need layered/3D source assets.
 * All keyframes live in globals.css (.scene-*) and honour prefers-reduced-motion.
 */
export function LoginStage({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  const { phase } = useScene();
  return (
    <section
      aria-label="YADEA"
      data-phase={phase}
      className="scene surface-graphite relative isolate flex h-[236px] flex-col overflow-hidden text-white sm:h-[270px] lg:sticky lg:top-0 lg:h-dvh lg:self-start"
    >
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_100%,black,transparent_75%)]" />

      <div className="relative z-10 flex items-start justify-between p-5 sm:p-7 lg:p-12 lg:pb-0">
        <Link href="/" aria-label="YADEA home" className="rounded focus-visible:outline-offset-4">
          <Image src="/brand/yadea-logo-light.png" alt="YADEA" width={167} height={36} priority className="scene-rise h-7 w-auto max-w-none object-contain sm:h-8 lg:h-9" />
        </Link>
        <span className="scene-rise rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wider uppercase ring-1 ring-white/15 backdrop-blur [animation-delay:120ms] lg:hidden">{eyebrow}</span>
      </div>

      <div className="relative z-10 hidden px-12 pt-8 lg:block">
        <p className="scene-rise mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider uppercase ring-1 ring-white/15 backdrop-blur [animation-delay:160ms]">
          <span aria-hidden className="bg-gradient-brand h-1.5 w-1.5 rounded-full shadow-[0_0_8px_rgb(196_168_255/0.9)]" />
          {eyebrow}
        </p>
        {children}
      </div>

      {/* Stage: floor, light, bike. Absolutely positioned so it never pushes the layout (no CLS, no horizontal scroll). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] lg:bottom-10 lg:h-[58%]">
        <div className="scene-glow absolute inset-x-[8%] bottom-[10%] h-[55%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(196_168_255/0.50),rgb(139_92_246/0.28)_60%,transparent)] blur-2xl" />
        <div className="absolute inset-x-0 bottom-[12%] h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-b from-white/[0.05] to-transparent" />

        <span className="scene-streak" style={{ bottom: "46%", right: "6%", width: "34%", animationDelay: "0.05s" }} />
        <span className="scene-streak" style={{ bottom: "34%", right: "2%", width: "46%", animationDelay: "0.15s" }} />
        <span className="scene-streak" style={{ bottom: "22%", right: "9%", width: "30%", animationDelay: "0.25s" }} />

        <div className="absolute inset-x-0 bottom-[12%] flex justify-center">
          <div className="scene-bike relative aspect-[1400/886] h-[118px] sm:h-[150px] lg:h-[clamp(200px,40dvh,540px)] max-w-[88%]">
            <div className="scene-shadow absolute inset-x-[6%] -bottom-[3%] h-[7%] rounded-[50%] bg-black/70 blur-md" />
            <Image src="/brand/yadea-g5s.webp" alt="" width={1400} height={886} priority sizes="(min-width: 1024px) 52vw, 90vw" className="relative h-full w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)]" />
            {/* Reflection of the same photo on the studio floor. */}
            <Image src="/brand/yadea-g5s.webp" alt="" width={1400} height={886} sizes="(min-width: 1024px) 52vw, 90vw" className="absolute top-full left-0 h-full w-full -scale-y-100 object-contain opacity-[0.16] blur-[1.5px] [mask-image:linear-gradient(to_bottom,black,transparent_38%)]" />
            <span className="scene-headlight absolute top-[52%] left-[29%] h-3 w-3 rounded-full bg-volt-300" />
          </div>
        </div>
        <span className="scene-sweep" />
      </div>

      {/* Floating cards (desktop): the product name and the live sign-in state. */}
      <div className="float-y absolute top-[47%] right-6 z-10 hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur-md lg:flex xl:right-10">
        <span className="bg-gradient-brand flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white">G5S</span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">YADEA G5S</span>
          <span className="block text-xs text-white/60">Electric scooter</span>
        </span>
      </div>
      <p role="status" aria-live="polite" className="float-y-slow absolute top-[58%] right-10 z-10 hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-medium text-white/85 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.6)] backdrop-blur-md lg:flex xl:right-16">
        <span aria-hidden className="scene-dot h-1.5 w-1.5 rounded-full" />
        {STATUS[phase]}
      </p>
      <div aria-hidden className="absolute inset-x-0 bottom-0 z-10 hidden h-10 overflow-hidden border-t border-white/10 bg-black/25 backdrop-blur-sm lg:block">
        <div className="marquee h-full items-center text-[12px] font-medium tracking-wide text-white/55">
          {[0, 1].map((n) => (
            <ul key={n} className="flex shrink-0 items-center gap-8 pr-8">
              {["Leads", "Test drives", "Dealerships", "Procurement", "Inventory", "Account ledger", "Vouchers", "Leaderboard"].map((w) => (
                <li key={w} className="flex items-center gap-8 whitespace-nowrap">
                  {w}
                  <span className="bg-gradient-brand h-1.5 w-1.5 rounded-full" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="absolute bottom-3 left-5 z-10 flex items-center gap-2 text-[11.5px] font-medium text-white/70 sm:bottom-4 sm:left-7 lg:hidden">
        <span aria-hidden className="scene-dot h-1.5 w-1.5 rounded-full" />
        {STATUS[phase]}
      </p>
      <p className="absolute right-5 bottom-3 z-10 hidden text-[11px] text-white/40 sm:right-7 sm:bottom-4 sm:block lg:hidden">© {new Date().getFullYear()} YADEA · Electric two-wheelers</p>
    </section>
  );
}
