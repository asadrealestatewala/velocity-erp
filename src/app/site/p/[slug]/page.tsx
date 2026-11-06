import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteEntries, publishedWebsite } from "@/server/website";
import { EntryBody } from "../../entry-body";

type Props = { params: Promise<{ slug: string }> };
const find = async (slug: string) => (await getSiteEntries()).find((e) => e.kind === "page" && e.published && e.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, s] = await Promise.all([params, publishedWebsite()]);
  const e = s ? await find(slug) : null;
  return e ? { title: `${e.title} · ${s!.siteName}`, description: e.summary || undefined } : { title: "Page", robots: { index: false } };
}

export default async function SitePageEntry({ params }: Props) {
  const { slug } = await params;
  await publishedWebsite();
  const e = await find(slug);
  if (!e) notFound();
  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">{e.title}</h1>
      <div className="mt-6"><EntryBody body={e.body} /></div>
    </article>
  );
}
