import { SiteShell } from "@/components/marketing/site-shell";

export const metadata = { title: "Terms of service", robots: { index: true, follow: true } };

// TEMPLATE ONLY: have these terms reviewed by a lawyer and edit the bracketed items before accepting real customers.
export default function TermsPage() {
  return (
    <SiteShell path="/legal/terms">
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-[15px] leading-relaxed text-ink-700 sm:px-6">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Template placeholder. This page must be replaced with terms approved by your legal adviser before you accept paying customers.</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink-900">Terms of service</h1>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">The service</h2>
        <p>We provide a hosted CRM and dealer-network workspace. Each company receives a private workspace with its own database and users. You are responsible for the people you invite and for what they enter.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Trials and plans</h2>
        <p>A free trial gives temporary access to a plan. When it ends the workspace becomes read-only until you choose a plan; your data is kept. Plan limits (staff logins, dealerships, contacts, storage) apply as shown on the pricing page.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Payment</h2>
        <p>Plans are paid in advance for the chosen period by card, bank transfer or supported wallet. Local payments are activated after we confirm the money has arrived. Refunds are handled case by case [state your refund policy here].</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Your data</h2>
        <p>Your data belongs to you. You can export it at any time. If you cancel, we keep it for [number] days and then delete it on request or automatically.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Acceptable use</h2>
        <p>Do not use the service to send spam, break the law, or attempt to access another company&apos;s workspace. We may suspend a workspace that does.</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Availability and liability</h2>
        <p>We work to keep the service available but do not guarantee uninterrupted operation. [Add your limitation of liability and governing law.]</p>
        <h2 className="pt-2 text-lg font-semibold text-ink-900">Contact</h2>
        <p>[Your company name, address and support email.]</p>
      </article>
    </SiteShell>
  );
}
