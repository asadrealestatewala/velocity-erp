import type { Metadata } from "next";
import { publishedWebsite, siteBase } from "@/server/website";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return s ? { title: `Become a dealer · ${s.siteName}`, description: "Apply to become an authorised dealer." } : { title: "Become a dealer", robots: { index: false } };
}

/** Dealer enquiry page in the site's own header and footer. The form is the website's "Contact us" form, so submissions land in the CRM like any other enquiry. */
export default async function BecomeADealerPage() {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const c = s.primaryColor;
  const apply = s.contactFormSlug ? `/forms/${s.contactFormSlug}` : `${base}/#contact`;
  const wa = s.whatsapp.replace(/\D/g, "");
  return (
    <section className="px-5 py-12 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: c }}>Partner with us</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">Become a {s.siteName} dealer</h1>
        <div className="mt-4 h-1 w-14 rounded-full" style={{ backgroundColor: c }} />
        <p className="mt-6 text-base leading-relaxed text-neutral-700 sm:text-lg">
          Interested in selling and servicing {s.siteName} electric vehicles in your city? Send us your details and our team will get back to you.
        </p>
        <p className="mt-4 text-sm text-neutral-500">Please include your name, your city, your business and how to reach you.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={apply} className="inline-flex min-w-[11rem] flex-1 items-center justify-center rounded-xl px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-md sm:flex-none" style={{ backgroundColor: c }}>Apply now</a>
          {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-w-[11rem] flex-1 items-center justify-center rounded-xl border border-neutral-300 px-8 py-3.5 text-sm font-bold text-neutral-900 sm:flex-none">Call {s.phone}</a>}
        </div>
        {(s.email || wa) && (
          <p className="mt-6 text-sm text-neutral-600">
            Prefer to write?{" "}
            {s.email && <a href={`mailto:${s.email}`} className="font-semibold underline" style={{ color: c }}>{s.email}</a>}
            {s.email && wa && " or "}
            {wa && <a href={`https://wa.me/${wa}`} className="font-semibold underline" style={{ color: c }}>WhatsApp</a>}
          </p>
        )}
      </div>
    </section>
  );
}
