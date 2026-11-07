import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";
import { EntryBody } from "../../entry-body";
import { ShareButton } from "../../share-button";

type Props = { params: Promise<{ slug: string }> };
const find = async (slug: string) => (await getSiteEntries()).find((e) => e.kind === "page" && e.published && e.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, s] = await Promise.all([params, publishedWebsite()]);
  const e = s ? await find(slug) : null;
  return e ? { title: `${e.title} · ${s!.siteName}`, description: e.summary || undefined } : { title: "Page", robots: { index: false } };
}

export default async function SitePageEntry({ params }: Props) {
  const { slug } = await params;
  const site = await publishedWebsite();
  const base = await siteBase();
  const e = await find(slug);
  if (!e) notFound();
  const isSupport = /support|help|ticket/i.test(e.slug);
  const own = e.cover && /^(https:\/\/|\/)[^\s"'()]+$/.test(e.cover) ? e.cover : null;
  const cover = own ?? (isSupport ? "/brand/support-cover.jpg" : null);
  return (
    <article>
      {isSupport ? (
        // Support pages: light brand banner, left-aligned bold heading and a short intro; the white wash keeps text readable over the artwork on phones.
        <header className="relative overflow-hidden px-5 py-14 text-neutral-900 sm:py-20 md:py-24" style={{ background: `url("${cover}") center right/cover no-repeat` }}>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/70 to-white/30 md:bg-gradient-to-r md:from-white/95 md:via-white/60 md:to-white/0" />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.25em] sm:text-sm" style={{ color: "var(--site)" }}>Customer care</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">{e.title}</h1>
            <div className="mt-5 h-1 w-14 rounded-full" style={{ backgroundColor: "var(--site)" }} />
            {e.summary && <p className="mt-5 max-w-xl text-base font-medium leading-7 text-neutral-700 sm:text-lg sm:leading-8">{e.summary}</p>}
            <ShareButton title={e.title} light />
          </div>
        </header>
      ) : (
      <header
        className={`px-5 text-center ${cover ? "py-20 text-neutral-900 sm:py-28" : "py-14 text-white sm:py-20"}`}
        style={{ background: cover ? `linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.7)), url("${cover}") center/cover no-repeat` : "linear-gradient(135deg, var(--site), #171717)" }}
      >
        <h1 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{e.title}</h1>
        {e.summary && <p className={`mx-auto mt-4 max-w-2xl text-base sm:text-lg ${cover ? "font-medium text-neutral-800" : "text-white/85"}`}>{e.summary}</p>}
        <ShareButton title={e.title} light={!!cover} />
      </header>
      )}
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <EntryBody body={e.body} />
        {site && isSupport && <SupportContact phone={site.phone} email={site.email} whatsapp={site.whatsapp} contactHref={site.contactFormSlug ? `/forms/${site.contactFormSlug}` : `${base}/#contact`} />}
      </div>
    </article>
  );
}

/** Real contact options (taken from the website settings) shown under support pages, so "Submit a ticket" always leads somewhere. */
function SupportContact({ phone, email, whatsapp, contactHref }: { phone: string; email: string; whatsapp: string; contactHref: string }) {
  const wa = whatsapp.replace(/\D/g, "");
  const tel = phone.replace(/[^\d+]/g, "");
  const card = "block rounded-2xl border border-neutral-200 border-t-4 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";
  return (
    <section aria-labelledby="reach-us" className="mt-12 rounded-3xl border border-neutral-200 bg-neutral-50 p-6 sm:p-10">
      <h2 id="reach-us" className="text-3xl font-extrabold tracking-tight text-neutral-900">Reach our support team</h2>
      <p className="mt-3 max-w-xl text-neutral-600">Tell us your name, phone number and bike model and we will come back to you within 48 business hours.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {tel && <a href={`tel:${tel}`} className={card} style={{ borderTopColor: "var(--site)" }}><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{/111/.test(phone) ? "UAN" : "Call us"}</span><span className="mt-2 block text-xl font-extrabold" style={{ color: "var(--site)" }}>{phone}</span></a>}
        {email && <a href={`mailto:${email}`} className={card} style={{ borderTopColor: "var(--site)" }}><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</span><span className="mt-2 block break-all text-lg font-extrabold sm:text-xl" style={{ color: "var(--site)" }}>{email}</span></a>}
        {wa && <a href={`https://wa.me/${wa}`} className={card} style={{ borderTopColor: "var(--site)" }}><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">WhatsApp</span><span className="mt-2 block text-xl font-extrabold" style={{ color: "var(--site)" }}>+{wa}</span></a>}
      </div>
      <a href={contactHref} className="mt-8 inline-block rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm" style={{ backgroundColor: "var(--site)" }}>Submit a ticket</a>
    </section>
  );
}
