import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publishedWebsite, siteBase } from "@/server/website";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return { title: s ? `In stock · ${s.siteName}` : "In stock", robots: { index: !!s } };
}

/** Public availability: which models each showroom has right now. Shows no counts, chassis numbers or customer data. */
export default async function SiteInventoryPage() {
  const s = (await publishedWebsite())!;
  if (!s.showInventory) notFound();
  const base = await siteBase();
  const rows = await db.inventoryItem.findMany({
    where: { quantity: { gt: 0 }, bikeModelId: { not: null }, bikeModel: { isActive: true, availability: { not: "DISCONTINUED" } }, dealership: { status: "ACTIVE" } },
    select: { quantity: true, reorderLevel: true, bikeModel: { select: { id: true, name: true, imageFileId: true } }, dealership: { select: { id: true, name: true, phone: true } } },
    orderBy: { bikeModel: { displayOrder: "asc" } },
  });
  const byModel = new Map<string, { id: string; name: string; imageFileId: string | null; where: { id: string; name: string; phone: string | null; low: boolean }[] }>();
  for (const r of rows) {
    const m = r.bikeModel!;
    const e = byModel.get(m.id) ?? { id: m.id, name: m.name, imageFileId: m.imageFileId, where: [] };
    e.where.push({ id: r.dealership.id, name: r.dealership.name, phone: r.dealership.phone, low: r.quantity <= Math.max(r.reorderLevel, 2) });
    byModel.set(m.id, e);
  }
  const list = [...byModel.values()];
  return (
    <section className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-3xl font-bold">Available now</h1>
      <p className="mt-2 text-neutral-600">Models currently in stock at our showrooms. Call ahead to reserve a bike or book a test drive.</p>
      {list.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-neutral-200 p-6 text-neutral-600">Nothing is listed as in stock right now. Please contact us for upcoming availability.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {list.map((m) => (
            <article key={m.id} className="flex gap-4 rounded-2xl border border-neutral-200 p-4">
              {m.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${m.imageFileId}`} alt={m.name} className="h-24 w-24 rounded-xl object-cover" />
              )}
              <div className="min-w-0">
                <a href={`${base}/models/${m.id}`} className="font-semibold hover:underline">{m.name}</a>
                <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                  {m.where.map((w) => (
                    <li key={w.id}>{w.name} · <span className={w.low ? "text-amber-700" : "text-green-700"}>{w.low ? "Few left" : "In stock"}</span>{w.phone && <> · <a href={`tel:${w.phone}`} className="underline">{w.phone}</a></>}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
