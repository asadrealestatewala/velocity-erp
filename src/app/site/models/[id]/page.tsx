import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtMoney, humanize } from "@/lib/utils";
import { publishedWebsite, siteBase } from "@/server/website";

type Props = { params: Promise<{ id: string }> };

const find = (id: string) => db.bikeModel.findFirst({ where: { id, isActive: true, availability: { not: "DISCONTINUED" } } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, s] = await Promise.all([params, publishedWebsite()]);
  const m = s ? await find(id) : null;
  return m ? { title: `${m.name} · ${s!.siteName}`, description: m.description ?? undefined } : { title: "Model", robots: { index: false } };
}

export default async function SiteModelPage({ params }: Props) {
  const { id } = await params;
  const s = (await publishedWebsite())!;
  const m = s.showModels ? await find(id) : null;
  if (!m) notFound();
  const base = await siteBase();
  const specs = Object.entries((m.specifications ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}?model=${m.id}` : null;
  return (
    <section className="mx-auto max-w-4xl px-5 py-12">
      <a href={`${base}/#models`} className="text-sm text-neutral-500 hover:underline">← All models</a>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        {m.imageFileId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="w-full rounded-2xl object-cover" />
        )}
        <div>
          <h1 className="text-3xl font-bold">{m.name}</h1>
          {m.category && <p className="text-sm uppercase tracking-wide text-neutral-500">{m.category}</p>}
          {m.price != null && <p className="mt-3 text-2xl font-bold" style={{ color: s.primaryColor }}>{fmtMoney(m.price.toString(), m.currency)}</p>}
          {m.description && <p className="mt-4 whitespace-pre-line text-neutral-700">{m.description}</p>}
          {testDrive && <a href={testDrive} className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ backgroundColor: s.primaryColor }}>Book a test drive</a>}
        </div>
      </div>
      {specs.length > 0 && (
        <dl className="mt-10 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {specs.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-neutral-200 pb-2"><dt className="text-neutral-500">{humanize(k)}</dt><dd className="font-medium">{String(v)}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
