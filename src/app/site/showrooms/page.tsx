import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publishedWebsite } from "@/server/website";
import { ShowroomList } from "../showroom-list";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return { title: s ? `Showrooms · ${s.siteName}` : "Showrooms", robots: s ? undefined : { index: false } };
}

/** All showrooms. Stores whose notes mention service are labelled "Showroom + After-service". */
export default async function ShowroomsPage() {
  const s = (await publishedWebsite())!;
  if (!s.showShowrooms) notFound();
  const rows = await db.dealership.findMany({
    where: { status: "ACTIVE", acceptsLeads: true },
    orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, address: true, phone: true, latitude: true, longitude: true, notes: true, city: { select: { name: true } } },
  });
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <h1 className="text-3xl font-bold">Showrooms</h1>
      <p className="mt-2 text-neutral-600">Find a store near you. Stores marked After-service also handle repairs and servicing.</p>
      <ShowroomList
        color={s.primaryColor}
        items={rows.map((d) => ({
          id: d.id, name: d.name, city: d.city.name, address: d.address ?? "", phone: d.phone ?? "",
          lat: d.latitude == null ? null : Number(d.latitude), lng: d.longitude == null ? null : Number(d.longitude),
          service: /service/i.test(d.notes ?? ""),
        }))}
      />
    </section>
  );
}
