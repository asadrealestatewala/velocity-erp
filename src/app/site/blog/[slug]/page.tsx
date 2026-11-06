import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";

type Props = { params: Promise<{ slug: string }> };
const find = async (slug: string) => (await getSiteEntries()).find((e) => e.kind === "post" && e.published && e.slug === slug) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, s] = await Promise.all([params, publishedWebsite()]);
  const e = s ? await find(slug) : null;
  return e ? { title: `${e.title} · ${s!.siteName}`, description: e.summary || undefined } : { title: "Blog", robots: { index: false } };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  await publishedWebsite();
  const e = await find(slug);
  if (!e) notFound();
  const base = await siteBase();
  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <a href={`${base}/blog`} className="text-sm text-neutral-500 hover:underline">← All posts</a>
      <h1 className="mt-4 text-3xl font-bold">{e.title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{fmtDate(e.date)}</p>
      <div className="mt-6 whitespace-pre-line leading-relaxed text-neutral-800">{e.body}</div>
    </article>
  );
}
