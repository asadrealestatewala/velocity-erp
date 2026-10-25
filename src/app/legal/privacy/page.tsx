import { SiteShell } from "@/components/marketing/site-shell";

export const metadata = { title: { absolute: "Privacy notice · Velocity" }, icons: { icon: "/brand/velocity-app-icon.png" }, robots: { index: true, follow: true } };

// TEMPLATE ONLY: have this reviewed by a lawyer and complete the bracketed items before accepting real customers.
export default function PlatformPrivacyPage() {
  return (
    <SiteShell path="/legal/privacy">
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-[15px] leading-relaxed text-ink-700 sm:px-6">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Template placeholder. Replace with a notice approved by your legal adviser.</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink-900">Privacy notice</h1>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Who this covers</h2>
        <p>This notice covers the people who sign up for or use a workspace on this platform. Your customers&apos; data inside a workspace is controlled by your company; we only process it to provide the service.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">What we collect</h2>
        <p>Account details (name, work email, company), billing records (plan, invoices, payment references), and security records (sign-in times and addresses). Card details are handled by our payment provider and never stored by us.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Website visits</h2>
        <p>We count page visits in aggregate (per page, per day). We use no advertising trackers, set no tracking cookies and store no identifiers for this, and we do nothing when your browser sends Do Not Track or Global Privacy Control.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">How we use it</h2>
        <p>To run your workspace, bill you, protect accounts, and contact you about your service. We do not sell personal data.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Your choices</h2>
        <p>You may ask us to access, correct, export or delete your data by contacting [support email].</p>
      </article>
    </SiteShell>
  );
}
