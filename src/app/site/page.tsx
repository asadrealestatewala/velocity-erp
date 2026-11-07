import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, parsePairs, parseRows, publishedWebsite, siteBase } from "@/server/website";
import { HeroSlider } from "./hero-slider";
import { PhotoTour } from "./photo-tour";

const SPEC_ROWS: [string, string[]][] = [
  ["Battery", ["battery_type"]],
  ["Capacity", ["battery_capacity"]],
  ["Motor", ["rated_motor_power", "peak_motor_power"]],
  ["Top speed", ["max_speed"]],
  ["Range", ["range"]],
];
/** Home "Popular Products": these models, in this order (first match per pattern; the full list stays on the Models page). */
const POPULAR: RegExp[] = [/gt\s*-?70/i, /ruibin/i, /t5l/i, /velax/i, /keeness/i];
/** Home-page text blocks that get a cover photo behind them (matched by title). The photo ships with the site, so no upload is needed. */
const COVER_BLOCKS: [RegExp, string][] = [
  [/ttfar/i, "/brand/battery-city-cover.jpg"],
  [/lithium\s+iron\s+phosphate/i, "/brand/battery-city-cover.jpg"],
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
  // Spotlight model: the GT70 when it is in the catalogue, otherwise one with a photo and the most spec lines (real data only).
  const gt70 = (m: { name: string }) => /gt\s*-?70/i.test(m.name);
  const spotlight = [...models].filter((m) => specLines(m.specifications).length >= 1)
    .sort((x, y) => Number(gt70(y)) - Number(gt70(x)) || Number(!!y.imageFileId) - Number(!!x.imageFileId) || specLines(y.specifications).length - specLines(x.specifications).length)[0];
  // Popular products: pick the first model matching each pattern (T5L prefers the plain "T5L" over variants); fall back to the full list if none match.
  const popularPicks = POPULAR.map((re) => {
    const hits = models.filter((m) => re.test(m.name));
    return hits.find((m) => /^(yadea\s+)?t5l$/i.test(m.name.trim())) ?? hits[0];
  }).filter((m, i, a): m is NonNullable<typeof m> => !!m && a.indexOf(m) === i);
  const popular = popularPicks.length > 0 ? popularPicks : models;
  const spotlightSpecs = spotlight ? specLines(spotlight.specifications) : [];
  // Photo tour: positions were checked by eye against the real GT70 product photo (x, y as fractions of the image), so it only runs for that photo.
  const tourModel = models.find((m) => gt70(m) && /7280/.test(m.name) && m.imageFileId) ?? models.find((m) => gt70(m) && m.imageFileId);
  const spec = new Map(Object.entries((tourModel?.specifications ?? {}) as Record<string, unknown>).map(([k, v]) => [norm(k), typeof v === "string" ? v : ""]));
  const sp = (...k: string[]) => k.map((x) => spec.get(x)).filter(Boolean).join(" · ");
  const tourPoints = tourModel ? [
    { x: 0.35, y: 0.46, title: "Headlamp", value: sp("headlamp") },
    { x: 0.51, y: 0.21, title: "Top speed", value: sp("max_speed") },
    { x: 0.34, y: 0.71, title: "Suspension", value: sp("shock_absorption") },
    { x: 0.30, y: 0.78, title: "Brakes", value: sp("brake_type") },
    { x: 0.58, y: 0.66, title: "Range", value: sp("range") },
    { x: 0.67, y: 0.52, title: "Battery", value: sp("battery_type", "battery_capacity") },
    { x: 0.68, y: 0.76, title: "Motor", value: [spec.get("motor_type") && `${spec.get("motor_type")} motor`, spec.get("rated_motor_power"), spec.get("peak_motor_power") && `${spec.get("peak_motor_power")} peak`].filter(Boolean).join(" · ") },
  ].filter((l) => l.value) : [];
  const btn = "inline-block rounded-full px-5 py-2.5 text-sm sm:px-6 sm:py-3 font-semibold";

  return (
    <>
      {slides.length > 0 ? <HeroSlider slides={slides} color={c} /> : s.heroPlainImage && s.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.heroImageUrl} alt={s.heroTitle} className="block h-auto w-full" fetchPriority="high" decoding="async" />
      )}
      <section data-sm-hero className={`relative overflow-hidden px-5 text-center text-white ${bannerMode ? "py-8 sm:py-10" : "py-12 sm:py-20"}`} style={{ backgroundColor: c }}>
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

      {spotlight && (
        <section id="engineered" className="overflow-hidden bg-white px-5 py-12 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: c }}>{spotlight.category || "Performance"}</p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-4xl">Engineered inside and out</h2>
            <div className="sm-spec mt-8 grid items-center gap-6 md:grid-cols-[1fr_1.2fr_1fr]">
              <ul data-sm-nofx className="order-2 grid gap-4 md:order-1">
                {spotlightSpecs.filter((_, i) => i % 2 === 0).map(([k, v]) => (
                  <li key={k} data-sm-nofx className="sm-callout sm-callout-l rounded-2xl border border-neutral-200 p-4 md:text-right"><p className="text-xs uppercase tracking-wide text-neutral-500">{k}</p><p className="mt-1 text-lg font-bold">{v}</p></li>
                ))}
              </ul>
              <a href={`${base}/models/${spotlight.id}`} className="sm-spec-bike order-1 block md:order-2" aria-label={spotlight.name}>
                {spotlight.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${spotlight.imageFileId}`} alt={spotlight.name} className="mx-auto aspect-[4/3] w-full object-contain" loading="lazy" decoding="async" />
                ) : (
                  <span className="grid aspect-[4/3] w-full place-items-center rounded-3xl bg-neutral-50 text-2xl font-extrabold" style={{ color: c }}>{spotlight.name}</span>
                )}
                {spotlight.imageFileId && <span className="mt-2 block text-center text-sm font-semibold">{spotlight.name}</span>}
              </a>
              <ul data-sm-nofx className="order-3 grid gap-4">
                {spotlightSpecs.filter((_, i) => i % 2 === 1).map(([k, v]) => (
                  <li key={k} data-sm-nofx className="sm-callout sm-callout-r rounded-2xl border border-neutral-200 p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">{k}</p><p className="mt-1 text-lg font-bold">{v}</p></li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {tourModel && tourPoints.length >= 3 && <PhotoTour src={`/api/files/${tourModel.imageFileId}`} name={tourModel.name} points={tourPoints} color={c} />}

      {popular.length > 0 && (
        <section id="models" className="bg-neutral-50 px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold">Popular Products</h2>
              <a href={`${base}/models`} className="text-sm font-semibold" style={{ color: c }}>View all models →</a>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map((m) => (
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

      {blocks.map(([title, text, points, label, link, image], k) => {
        const cover = COVER_BLOCKS.find(([re]) => re.test(title ?? ""))?.[1];
        const pills = points && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {points.split(";").map((x) => x.trim()).filter(Boolean).map((x) => (
              <li key={x} className="rounded-full px-4 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: c }}>{x}</li>
            ))}
          </ul>
        );
        const cta = label && link && <a href={link === "/#showrooms" ? `${base}/showrooms` : link.startsWith("/#") ? `${base}${link}` : link} className={`${btn} mt-6 text-white`} style={{ backgroundColor: c }}>{label}</a>;
        if (cover) {
          // Cover-photo block: the photo sits behind the text; a white wash keeps the copy readable (strong on phones, fading to the photo on desktop).
          return (
            <section key={title} className="relative overflow-hidden bg-white px-5 py-12 text-neutral-900 sm:py-16 md:py-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover object-[78%_center]" loading="lazy" decoding="async" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/70 to-white/5 md:bg-gradient-to-r md:from-white/95 md:via-white/75 md:to-white/0" />
              <div className="relative mx-auto max-w-5xl">
                <div className="max-w-xl pb-40 md:pb-16">
                  <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>
                  {text && <p className="mt-4 text-neutral-700">{text}</p>}
                  {pills}
                  {cta}
                </div>
              </div>
            </section>
          );
        }
        return (
        <section key={title} className={`px-5 py-12 sm:py-16 ${k % 2 === 0 ? "bg-neutral-50 text-neutral-900" : "bg-white text-neutral-900"}`}>
          <div className={`mx-auto grid max-w-5xl items-center gap-8 ${image ? "md:grid-cols-2" : ""}`}>
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>
              {text && <p className="mt-4 text-neutral-600">{text}</p>}
              {pills}
              {cta}
            </div>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="w-full rounded-2xl object-cover" loading="lazy" decoding="async" />
            )}
          </div>
        </section>
        );
      })}

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
        <section id="why" className="bg-neutral-50 px-5 py-14 text-neutral-900">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">{s.highlightsTitle}</h2>
            {s.highlightsIntro && <p className="mt-4 max-w-2xl text-neutral-600">{s.highlightsIntro}</p>}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map((x) => (
                <details key={x.a} className="group rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold">{x.a}</h3>
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl font-bold leading-none text-white group-open:rotate-45" style={{ backgroundColor: c }}>+</span>
                  </summary>
                  <p className="mt-4 text-sm text-neutral-600">{x.b}</p>
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
                  <img src={s.logoUrl} alt="" data-sm-skip className="mx-auto h-8 w-auto" />
                )}
                <h3 className="mt-4 text-2xl font-extrabold uppercase" style={{ color: c }}>{title}</h3>
                {text && <p className="mt-3 text-sm text-neutral-500">{text}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      {impact.length > 0 && (
        <section id="impact" className="bg-white px-5 py-14 text-neutral-900">
          <div className="mx-auto max-w-5xl">
            {s.impactTitle && <h2 className="text-center text-3xl font-extrabold">{s.impactTitle}</h2>}
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {impact.map(([value, label, image]) => (
                <div key={value} className="relative flex min-h-56 flex-col justify-center overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
                  )}
                  <div className="relative">
                    <p className="text-2xl font-extrabold sm:text-3xl" style={{ color: c }}>{value}</p>
                    <p className="mt-2 text-neutral-700">{label}</p>
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
