import Image from "next/image";
import Link from "next/link";
import { AuthSceneProvider } from "./auth-scene";
import { LoginStage } from "./login-stage";

const EYEBROW = { crm: "Central CRM", portal: "Dealer Portal", procurement: "Procurement" } as const;
const HEADLINE = {
  crm: "Every lead, every dealership, one view.",
  procurement: "Every order, every showroom, delivered on time.",
  portal: "Follow up faster. Convert more riders.",
} as const;
const COPY = {
  crm: "Capture inquiries from every channel, route test drives to the right outlet and track the whole network's performance.",
  procurement: "Receive dealership stock orders, dispatch goods, track deliveries and keep every dealer ledger and voucher in order.",
  portal: "Your assigned and walk-in leads, test drives, stock and orders, ledger and team goals — all in one place.",
} as const;

export function AuthLayout({ title, subtitle, children, footer, variant }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode; variant: "crm" | "portal" | "procurement" }) {
  return (
    <AuthSceneProvider>
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        {/* The stage is pinned to the window height on desktop; on phones it is a compact banner above the form so the bike never covers it. */}
        <LoginStage eyebrow={EYEBROW[variant]}>
          <h2 className="scene-rise max-w-md text-[2.5rem] leading-[1.1] font-bold tracking-tight [animation-delay:240ms] xl:text-5xl">{HEADLINE[variant]}</h2>
          <p className="scene-rise mt-4 max-w-md text-[15px] leading-relaxed text-white/65 [animation-delay:320ms]">{COPY[variant]}</p>
        </LoginStage>

        <div className="relative flex min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(90%_60%_at_100%_0%,rgb(238_108_0/0.07),transparent),radial-gradient(70%_50%_at_0%_100%,rgb(14_174_207/0.06),transparent)] px-4 py-10 sm:px-8 lg:py-12">
          <div className="scene-rise w-full max-w-[26rem] [animation-delay:200ms]">
            <Link href="/" className="mb-6 hidden lg:inline-block" aria-label="YADEA home">
              <Image src="/brand/yadea-logo-dark.png" alt="YADEA" width={149} height={32} className="h-7 w-auto max-w-none object-contain" priority />
            </Link>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink-900">{title}</h1>
            <p className="mt-1.5 mb-8 text-[15px] text-ink-500">{subtitle}</p>
            {children}
            <div className="mt-8 border-t border-ink-100 pt-6 text-sm text-ink-500">{footer}</div>
          </div>
        </div>
      </div>
    </AuthSceneProvider>
  );
}
