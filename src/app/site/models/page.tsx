import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/utils";
import { publishedWebsite, siteBase } from "@/server/website";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return s ? { title: `Models · ${s.siteName}` } : { title: "Models", robots: { index: false } };
}

export default async function SiteModelsPage() {
  const s = (await publishedWebsite())!;
  if (!s.showModels) notFound();
  const base = await siteBase();
  const c = s.primaryColor;
  const models = await db.bikeModel.findMany({
    where: { isActive: true, availability: { not: "DISCONTINUED" } },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, category: true, imageFileId: true, price: true, currency: true },
  });
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}` : null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <a href={base || "/"} className="hover:underline">Home</a><span className="mx-2">›</span>
        <span className="font-semibold text-neutral-800">Models</span>
      </nav>
      <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">All models</h1>
      {models.length === 0 ? (
        <p className="mt-6 text-neutral-500">No models are listed yet.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <div key={m.id} className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <a href={`${base}/models/${m.id}`} className="block bg-neutral-50">
                {m.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="aspect-[4/3] w-full object-contain" loading="lazy" decoding="async" />
                ) : <div className="aspect-[4/3]" />}
              </a>
              <div className="flex flex-1 flex-col p-4">
                {m.category && <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: c }}>{m.category}</p>}
                <h2 className="mt-1 text-lg font-bold">{m.name}</h2>
                {m.price != null && <p className="mt-1 font-bold" style={{ color: c }}>{fmtMoney(m.price.toString(), m.currency)}</p>}
                <div className="mt-auto flex gap-2 pt-4 text-[12.5px] font-semibold leading-none sm:text-sm">
                  <a href={`${base}/models/${m.id}`} className="flex-1 whitespace-nowrap rounded-full border border-neutral-300 px-1.5 py-3 text-center">Learn more</a>
                  {testDrive && <a href={`${testDrive}?model=${m.id}`} className="flex-1 whitespace-nowrap rounded-full px-1.5 py-3 text-center text-white" style={{ backgroundColor: c }}>Book a test ride</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
