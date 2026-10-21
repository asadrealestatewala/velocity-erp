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
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-volt-400 shadow-[0_0_8px_var(--color-volt-400)]" />
          {eyebrow}
        </p>
        {children}
      </div>

      {/* Stage: floor, light, bike. Absolutely positioned so it never pushes the layout (no CLS, no horizontal scroll). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] lg:h-[58%]">
        <div className="scene-glow absolute inset-x-[8%] bottom-[10%] h-[55%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(238_108_0/0.34),rgb(14_174_207/0.10)_60%,transparent)] blur-2xl" />
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

      <p role="status" aria-live="polite" className="absolute bottom-3 left-5 z-10 flex items-center gap-2 text-[11.5px] font-medium text-white/70 sm:bottom-4 sm:left-7 lg:bottom-6 lg:left-12">
        <span aria-hidden className="scene-dot h-1.5 w-1.5 rounded-full" />
        {STATUS[phase]}
      </p>
      <p className="absolute right-5 bottom-3 z-10 hidden text-[11px] text-white/40 sm:right-7 sm:bottom-4 sm:block lg:right-12 lg:bottom-6">© {new Date().getFullYear()} YADEA · Electric two-wheelers</p>
    </section>
  );
}
