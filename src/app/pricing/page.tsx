import { SiteShell } from "@/components/marketing/site-shell";
import { Pricing } from "@/components/marketing/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Pricing · Velocity" }, icons: { icon: "/brand/velocity-app-icon.png" }, description: "Plans for dealer networks of every size. Start free, pay by card, bank transfer or wallet.", robots: { index: true, follow: true } };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ currency?: string; interval?: string }> }) {
  const sp = await searchParams;
  const currency = sp.currency === "USD" ? "USD" : "PKR";
  const interval = sp.interval === "YEAR" ? "YEAR" : "MONTH";
  return (
    <SiteShell path="/pricing">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="text-center text-4xl font-bold tracking-tight">Pricing</h1>
        <p className="mx-auto mt-3 mb-10 max-w-xl text-center text-ink-600">Every plan starts with a free trial. Limits apply to staff logins, dealerships, contacts and storage; you can change plan at any time.</p>
        <Pricing currency={currency} interval={interval} basePath="/pricing" />
      </div>
    </SiteShell>
  );
}
