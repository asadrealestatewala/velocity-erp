import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { getWebsite } from "@/server/website";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getWebsite();
  if (!s.published) return { title: "Website", robots: { index: false } };
  return { title: s.seoTitle || s.siteName, description: s.seoDescription || s.tagline };
}

export default async function SitePage() {
  const s = await getWebsite();
  if (!s.published) notFound();
  const [models, showrooms] = await Promise.all([
    s.showModels
      ? db.bikeModel.findMany({ where: { isActive: true, availability: { not: "DISCONTINUED" } }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true, category: true, description: true, imageFileId: true, price: true, currency: true } })
      : [],
    s.showShowrooms
      ? db.dealership.findMany({ where: { status: "ACTIVE", acceptsLeads: true }, orderBy: { name: "asc" }, select: { id: true, name: true, address: true, phone: true } })
      : [],
  ]);
  const c = s.primaryColor;
  const wa = s.whatsapp.replace(/\D/g, "");
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}` : null;
  const contact = s.contactFormSlug ? `/forms/${s.contactFormSlug}` : null;
  const btn = "inline-block rounded-full px-6 py-3 text-sm font-semibold";

  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <span className="text-lg font-bold" style={{ color: c }}>{s.siteName}</span>
        <nav className="flex items-center gap-4 text-sm font-medium">
          {models.length > 0 && <a href="#models">Models</a>}
          {showrooms.length > 0 && <a href="#showrooms">Showrooms</a>}
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="relative px-5 py-20 text-center text-white" style={{ backgroundColor: c }}>
        {s.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        )}
        <div className="relative mx-auto max-w-2xl">
          <h1 className="text-4xl font-extrabold sm:text-5xl">{s.heroTitle}</h1>
          {s.heroSubtitle && <p className="mt-4 text-lg opacity-90">{s.heroSubtitle}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {testDrive && <a href={testDrive} className={`${btn} bg-white`} style={{ color: c }}>Book a test drive</a>}
            {contact && <a href={contact} className={`${btn} border border-white text-white`}>Contact us</a>}
          </div>
        </div>
      </section>

      {s.about && (
        <section className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-2xl font-bold">About us</h2>
          <p className="mt-3 whitespace-pre-line text-neutral-700">{s.about}</p>
        </section>
      )}

      {models.length > 0 && (
        <section id="models" className="bg-neutral-50 px-5 py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">Our models</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => (
                <article key={m.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {m.imageFileId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="aspect-[4/3] w-full object-cover" />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold">{m.name}</h3>
                    {m.category && <p className="text-xs uppercase tracking-wide text-neutral-500">{m.category}</p>}
                    {m.description && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{m.description}</p>}
                    {m.price != null && <p className="mt-3 font-bold" style={{ color: c }}>{fmtMoney(m.price.toString(), m.currency)}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {showrooms.length > 0 && (
        <section id="showrooms" className="mx-auto max-w-5xl px-5 py-14">
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

      <footer id="contact" className="bg-neutral-900 px-5 py-12 text-neutral-200">
        <div className="mx-auto max-w-5xl space-y-1 text-sm">
          <p className="text-lg font-semibold text-white">{s.siteName}</p>
          {s.address && <p>{s.address}</p>}
          {s.phone && <p>Phone: <a href={`tel:${s.phone}`} className="underline">{s.phone}</a></p>}
          {wa && <p>WhatsApp: <a href={`https://wa.me/${wa}`} className="underline">+{wa}</a></p>}
          {s.email && <p>Email: <a href={`mailto:${s.email}`} className="underline">{s.email}</a></p>}
          <p className="pt-4 text-xs text-neutral-500">© {new Date().getFullYear()} {s.siteName}</p>
        </div>
      </footer>
    </div>
  );
}
