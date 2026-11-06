import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, parsePairs, parseRows, publishedWebsite, siteBase } from "@/server/website";
import { HeroSlider } from "./hero-slider";

const SPEC_ROWS: [string, string[]][] = [
  ["Battery", ["battery_type"]],
  ["Capacity", ["battery_capacity"]],
  ["Motor", ["rated_motor_power", "peak_motor_power"]],
  ["Top speed", ["max_speed"]],
  ["Range", ["range"]],
];
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_");
function specLines(specs: unknown): [string, string][] {
  const map = new Map(Object.entries((specs ?? {}) as Record<string, unknown>).map(([k, v]) => [norm(k), v]));
  return SPEC_ROWS.flatMap(([label, keys]) => {
    const key = keys.find((k) => typeof map.get(k) === "string" && map.get(k) !== "");
    return key ? [[label, String(map.get(key))] as [string, string]] : [];
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  if (!s) return { title: "Website", robots: { index: false } };
  return { title: s.seoTitle || s.siteName, description: s.seoDescription || s.tagline };
}

export default async function SitePage() {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const [models] = await Promise.all([
    s.showModels
      ? db.bikeModel.findMany({ where: { isActive: true, availability: { not: "DISCONTINUED" } }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true, category: true, description: true, imageFileId: true, price: true, currency: true, specifications: true } })
      : [],
  ]);
  const c = s.primaryColor;
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}` : null;
  const contact = s.contactFormSlug ? `/forms/${s.contactFormSlug}` : null;
  const stats = parsePairs(s.statsText);
  const highlights = parsePairs(s.highlightsText);
  const programs = parsePairs(s.programsText);
  const impact = parseRows(s.impactText);
  const cards = parseRows(s.cardsText);
  const darkWhy = !!s.highlightsTitle;
  const slides = parseRows(s.slidesText).filter((r) => r[0]).map((r) => ({ src: r[0]!, href: r[1] ? (r[1].startsWith("/#") ? `${base}${r[1]}` : r[1]) : "", alt: r[2] ?? "" }));
  const blocks = parseRows(s.blocksText);
  const bannerMode = slides.length > 0 || (s.heroPlainImage && !!s.heroImageUrl);
  const posts = s.insightsTitle ? (await getSiteEntries()).filter((e) => e.kind === "post" && e.published).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3) : [];
  const featured = s.featuredTitle ? models.filter((m) => m.imageFileId) : [];
  const btn = "inline-block rounded-full px-5 py-2.5 text-sm sm:px-6 sm:py-3 font-semibold";

  return (
    <>
      {slides.length > 0 ? <HeroSlider slides={slides} color={c} /> : s.heroPlainImage && s.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.heroImageUrl} alt={s.heroTitle} className="block h-auto w-full" fetchPriority="high" decoding="async" />
      )}
      <section className={`relative px-5 text-center text-white ${bannerMode ? "py-8 sm:py-10" : "py-12 sm:py-20"}`} style={{ backgroundColor: c }}>
        {s.heroImageUrl && !bannerMode && (
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

      {featured.length > 0 && (
        <section id="latest" className="bg-white px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold">{s.featuredTitle}</h2>
            <div className="-mx-5 mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4">
              {featured.map((m) => (
                <div key={m.id} className="w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-neutral-200 bg-white sm:w-80">
                  <a href={`${base}/models/${m.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="aspect-[4/3] w-full bg-white object-contain" loading="lazy" decoding="async" />
                  </a>
                  <div className="p-4">
                    <h3 className="text-lg font-bold">{m.name}</h3>
                    <dl className="mt-3 space-y-1 text-sm">
                      {specLines(m.specifications).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-neutral-100 pb-1"><dt className="text-neutral-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                      ))}
                    </dl>
                    <div className="mt-4 flex gap-2 text-sm font-semibold">
                      <a href={`${base}/models/${m.id}`} className="rounded-full border border-neutral-300 px-4 py-2">Learn more</a>
                      {testDrive && <a href={`${testDrive}?model=${m.id}`} className="rounded-full px-4 py-2 text-white" style={{ backgroundColor: c }}>Book a test ride</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

      {blocks.map(([title, text, points, label, link, image], k) => (
        <section key={title} className={`px-5 py-12 sm:py-16 ${k % 2 === 0 ? "bg-neutral-900 text-white" : "bg-white text-neutral-900"}`}>
          <div className={`mx-auto grid max-w-5xl items-center gap-8 ${image ? "md:grid-cols-2" : ""}`}>
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>
              {text && <p className={`mt-4 ${k % 2 === 0 ? "text-neutral-300" : "text-neutral-600"}`}>{text}</p>}
              {points && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {points.split(";").map((x) => x.trim()).filter(Boolean).map((x) => (
                    <li key={x} className="rounded-full px-4 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: c }}>{x}</li>
                  ))}
                </ul>
              )}
              {label && link && <a href={link === "/#showrooms" ? `${base}/showrooms` : link.startsWith("/#") ? `${base}${link}` : link} className={`${btn} mt-6 text-white`} style={{ backgroundColor: c }}>{label}</a>}
            </div>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="w-full rounded-2xl object-cover" loading="lazy" decoding="async" />
            )}
          </div>
        </section>
      ))}

      {highlights.length > 0 && !darkWhy && (
        <section id="why" className="mx-auto max-w-5xl px-5 py-14">
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

      {highlights.length > 0 && darkWhy && (
        <section id="why" className="bg-neutral-800 px-5 py-14 text-white">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">{s.highlightsTitle}</h2>
            {s.highlightsIntro && <p className="mt-4 max-w-2xl text-neutral-200">{s.highlightsIntro}</p>}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map((x) => (
                <details key={x.a} className="group rounded-xl bg-black p-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold">{x.a}</h3>
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-xl font-bold leading-none text-black group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 text-sm text-neutral-300">{x.b}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="bg-neutral-100 px-5 py-14">
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
            {cards.map(([title, text, link]) => (
              <a key={title} href={link ? (link === "/#showrooms" ? `${base}/showrooms` : link.startsWith("/#") ? `${base}${link}` : link) : undefined} className="block rounded-3xl bg-white p-8 text-center shadow-sm transition hover:shadow-md">
                {s.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt="" className="mx-auto h-8 w-auto" />
                )}
                <h3 className="mt-4 text-2xl font-extrabold uppercase" style={{ color: c }}>{title}</h3>
                {text && <p className="mt-3 text-sm text-neutral-500">{text}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      {impact.length > 0 && (
        <section id="impact" className="bg-neutral-800 px-5 py-14 text-white">
          <div className="mx-auto max-w-5xl">
            {s.impactTitle && <h2 className="text-center text-3xl font-extrabold">{s.impactTitle}</h2>}
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {impact.map(([value, label, image]) => (
                <div key={value} className="relative flex min-h-56 flex-col justify-center overflow-hidden rounded-3xl bg-black p-6">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
                  )}
                  <div className="relative">
                    <p className="text-2xl font-extrabold sm:text-3xl" style={{ color: c }}>{value}</p>
                    <p className="mt-2 text-neutral-100">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {posts.length > 0 && (
        <section id="insights" className="bg-neutral-50 px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold">{s.insightsTitle}</h2>
              <a href={`${base}/blog`} className="text-sm font-semibold" style={{ color: c }}>View all →</a>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {posts.map((p) => (
                <a key={p.slug} href={`${base}/blog/${p.slug}`} className="block rounded-2xl border border-neutral-200 bg-white p-5 transition hover:shadow-md">
                  <p className="text-xs text-neutral-500">{fmtDate(p.date)}</p>
                  <h3 className="mt-1 font-semibold">{p.title}</h3>
                  {p.summary && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{p.summary}</p>}
                </a>
              ))}
            </div>
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

      {s.subscribeTitle && (
        <section className="px-5 py-12 text-center text-white" style={{ backgroundColor: c }}>
          <h2 className="text-2xl font-extrabold">{s.subscribeTitle}</h2>
          {s.subscribeText && <p className="mx-auto mt-3 max-w-xl opacity-90">{s.subscribeText}</p>}
          {contact && <a href={contact} className={`${btn} mt-6 bg-white`} style={{ color: c }}>Subscribe</a>}
        </section>
      )}
    </>
  );
}
