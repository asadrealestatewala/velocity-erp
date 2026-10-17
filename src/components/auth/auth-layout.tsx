import Image from "next/image";
import Link from "next/link";

export function AuthLayout({ title, subtitle, children, footer, variant }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode; variant: "crm" | "portal" }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Pinned to the window height: the right column can be taller (credentials panel, long forms), and the
          headline must stay on screen instead of drifting to the bottom of a stretched panel. */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:sticky lg:top-0 lg:block lg:h-dvh lg:self-start">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(240,116,0,0.35),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(240,116,0,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          {/* self-start: in a flex column an auto-width image would otherwise stretch to the full panel width. */}
          <Image src="/brand/yadea-logo-light.png" alt="YADEA" width={167} height={36} className="h-9 w-auto max-w-none shrink-0 self-start object-contain" priority />
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider uppercase ring-1 ring-white/15">
              {variant === "crm" ? "Central CRM" : "Dealer Portal"}
            </p>
            <h2 className="max-w-md text-4xl leading-tight font-bold">
              {variant === "crm" ? "Every lead, every dealership, one view." : "Follow up faster. Convert more riders."}
            </h2>
            <p className="mt-4 max-w-md text-ink-300">
              {variant === "crm"
                ? "Capture inquiries from every channel, route test drives to the right outlet and track the whole network's performance."
                : "Your assigned and walk-in leads, test drives and team goals — all in one place."}
            </p>
          </div>
          <p className="text-xs text-ink-500">© {new Date().getFullYear()} YADEA · Electric two-wheelers</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Image src="/brand/yadea-logo-dark.png" alt="YADEA" width={149} height={32} className="h-8 w-auto max-w-none object-contain" priority />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-1 mb-8 text-sm text-ink-500">{subtitle}</p>
          {children}
          <div className="mt-8 border-t border-ink-100 pt-6 text-sm text-ink-500">{footer}</div>
        </div>
      </div>
    </div>
  );
}
