import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { parsePairs, publishedWebsite, siteBase } from "@/server/website";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  if (!s) return { title: "Website", robots: { index: false } };
  return { title: s.seoTitle || s.siteName, description: s.seoDescription || s.tagline };
}

export default async function SitePage() {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const [models, showrooms] = await Promise.all([
    s.showModels
      ? db.bikeModel.findMany({ where: { isActive: true, availability: { not: "DISCONTINUED" } }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true, category: true, description: true, imageFileId: true, price: true, currency: true } })
      : [],
    s.showShowrooms
      ? db.dealership.findMany({ where: { status: "ACTIVE", acceptsLeads: true }, orderBy: { name: "asc" }, select: { id: true, name: true, address: true, phone: true } })
      : [],
  ]);
  const c = s.primaryColor;
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}` : null;
  const contact = s.contactFormSlug ? `/forms/${s.contactFormSlug}` : null;
  const stats = parsePairs(s.statsText);
  const highlights = parsePairs(s.highlightsText);
  const programs = parsePairs(s.programsText);
  const btn = "inline-block rounded-full px-5 py-2.5 text-sm sm:px-6 sm:py-3 font-semibold";

  return (
    <>
      {s.heroPlainImage && s.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.heroImageUrl} alt={s.heroTitle} className="block h-auto w-full" fetchPriority="high" decoding="async" />
      )}
      <section className={`relative px-5 text-center text-white ${s.heroPlainImage && s.heroImageUrl ? "py-8 sm:py-10" : "py-12 sm:py-20"}`} style={{ backgroundColor: c }}>
        {s.heroImageUrl && !s.heroPlainImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" decoding="async" />
        )}
        <div className="relative mx-auto max-w-2xl">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-5xl">{s.heroTitle}</h1>
          {s.heroSubtitle && <p className="mt-3 line-clamp-4 text-sm opacity-90 sm:mt-4 sm:line-clamp-none sm:text-lg">{s.heroSubtitle}</p>}
          <div className="mt-6 flex flex-wrap sm:mt-8 justify-center gap-3">
            {testDrive && <a href={testDrive} className={`${btn} bg-white`} style={{ color: c }}>Book a test drive</a>}
            {contact && <a href={contact} className={`${btn} border border-white text-white`}>Contact us</a>}
          </div>
        </div>
      </section>

      {s.about && (
        <section className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
          <h2 className="text-2xl font-bold">About us</h2>
          <p className="mt-3 whitespace-pre-line text-neutral-700">{s.about}</p>
        </section>
      )}

      {models.length > 0 && (
        <section id="models" className="bg-neutral-50 px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">Our models</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => (
                <a key={m.id} href={`${base}/models/${m.id}`} className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md">
                  {m.imageFileId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold">{m.name}</h3>
                    {m.category && <p className="text-xs uppercase tracking-wide text-neutral-500">{m.category}</p>}
                    {m.description && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{m.description}</p>}
                    {m.price != null && <p className="mt-3 font-bold" style={{ color: c }}>{fmtMoney(m.price.toString(), m.currency)}</p>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {stats.length > 0 && (
        <section className="px-5 py-10 sm:py-14 text-white" style={{ backgroundColor: c }}>
          <dl className="mx-auto grid max-w-5xl gap-6 text-center sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((x) => (
              <div key={x.a}><dt className="text-3xl font-extrabold">{x.a}</dt><dd className="mt-1 text-sm opacity-90">{x.b}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {highlights.length > 0 && (
        <section id="why" className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
          <h2 className="text-2xl font-bold">Why choose us</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((x) => (
              <div key={x.a} className="rounded-2xl border border-neutral-200 p-5">
                <h3 className="font-semibold" style={{ color: c }}>{x.a}</h3>
                <p className="mt-2 text-sm text-neutral-600">{x.b}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {programs.length > 0 && (
        <section id="programs" className="bg-neutral-50 px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">Ownership programs</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {programs.map((x) => (
                <div key={x.a} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h3 className="font-semibold">{x.a}</h3>
                  <p className="mt-2 text-sm text-neutral-600">{x.b}</p>
                  {contact && <a href={contact} className="mt-4 inline-block text-sm font-semibold" style={{ color: c }}>Enquire →</a>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {showrooms.length > 0 && (
        <section id="showrooms" className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
          <h2 className="text-2xl font-bold">Showrooms</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {showrooms.map((d) => (
              <li key={d.id} className="rounded-2xl border border-neutral-200 p-4">
                <p className="font-semibold">{d.name}</p>
                {d.address && <p className="text-sm text-neutral-600">{d.address}</p>}
                {d.phone && <p className="text-sm"><a href={`tel:${d.phone}`} style={{ color: c }}>{d.phone}</a></p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
