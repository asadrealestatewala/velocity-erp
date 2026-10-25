import Image from "next/image";
import { redirect } from "next/navigation";
import { BarChart3, Bike, Building2, ShieldCheck, Trophy, Truck } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { homePathFor } from "@/lib/home";
import { ButtonLink } from "@/components/ui/button";
import { SiteShell } from "@/components/marketing/site-shell";
import { Pricing } from "@/components/marketing/pricing";
import { DemoForm, WorkspaceFinder } from "@/components/marketing/forms";
import { getPlatformSettings } from "@/server/platform/settings";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Velocity — the CRM for dealer networks" },
  icons: { icon: "/brand/velocity-app-icon.png" },
  description: "Capture every lead, route test drives to the right showroom, run procurement and dealer ledgers. A private workspace for your company, free for the first days.",
  robots: { index: true, follow: true },
};

const FEATURES = [
  { icon: Bike, title: "Every lead in one pipeline", text: "Website forms, WhatsApp and walk-ins land in one place and are routed to the right showroom automatically." },
  { icon: Building2, title: "Dealer portal", text: "Each dealership sees only its own leads, test drives, stock and orders, with goals and a friendly leaderboard." },
  { icon: Truck, title: "Procurement and ledger", text: "Dealer stock orders, dispatch, deliveries and a proper ledger with vouchers and statements." },
  { icon: BarChart3, title: "Reports that match reality", text: "Conversion, response time and network performance from your real records, never estimates." },
  { icon: Trophy, title: "Motivated teams", text: "Goals, XP and streaks turn daily follow-ups into a habit your dealers actually enjoy." },
  { icon: ShieldCheck, title: "Your data stays yours", text: "Every company gets its own private database. Nobody else can read it, and you can export it any time." },
];

const FAQ = [
  ["Is my data separate from other companies?", "Yes. Each company has its own database schema and its own users. Sign-in is per workspace."],
  ["What happens when the trial ends?", "Your workspace becomes read-only. Nothing is deleted. Choose a plan and it unlocks immediately."],
  ["How can I pay?", "By card, or by bank transfer or wallet (Raast, Easypaisa, JazzCash). We confirm local payments and activate your plan."],
  ["Can I invite my team?", "Yes. Invite staff and dealership users by email; the plan sets how many logins you can have."],
  ["Can I cancel?", "Any time. You keep access until the end of the period you paid for."],
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.scope, user.permissions));
  let trialDays = 7;
  try {
    trialDays = (await getPlatformSettings()).trialDays;
  } catch {
    redirect("/login"); // control plane unavailable: behave like the original single-company install
  }
  return (
    <SiteShell path="/">
      <section className="relative overflow-hidden bg-[radial-gradient(80%_60%_at_80%_0%,rgb(238_108_0/0.10),transparent),radial-gradient(60%_50%_at_0%_100%,rgb(14_174_207/0.08),transparent)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">For e-mobility brands and dealer networks</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Every lead, every dealership, one view.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-600">Capture inquiries from every channel, route test drives to the right showroom, and run orders and ledgers with your dealers. Your own private workspace, ready in minutes.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">{trialDays > 0 ? `Start your ${trialDays}-day free trial` : "Create your workspace"}</ButtonLink>
              <ButtonLink href="/pricing" size="lg" variant="secondary">See pricing</ButtonLink>
            </div>
            <p className="mt-3 text-sm text-ink-500">No card needed to start.</p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <Image src="/brand/yadea-g5s.webp" alt="Electric scooter" width={640} height={480} className="h-auto w-full drop-shadow-2xl" priority />
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Everything a dealer network runs on</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><f.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink-50/60 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
          <p className="mb-8 text-center text-ink-600">Start free. Upgrade when your network grows.</p>
          <Pricing currency="PKR" interval="MONTH" basePath="/pricing" />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y divide-ink-100 rounded-2xl border border-ink-100">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary>
              <p className="mt-2 text-sm text-ink-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink-100 p-6">
          <h2 className="text-xl font-bold">Already have a workspace?</h2>
          <p className="mt-1 mb-4 text-sm text-ink-600">Enter your company&apos;s workspace code to reach your sign-in page.</p>
          <WorkspaceFinder />
        </div>
        <div className="rounded-2xl border border-ink-100 p-6">
          <h2 className="text-xl font-bold">Talk to us</h2>
          <p className="mt-1 mb-4 text-sm text-ink-600">Want a walkthrough for your network? Leave your details.</p>
          <DemoForm />
        </div>
      </section>
    </SiteShell>
  );
}
