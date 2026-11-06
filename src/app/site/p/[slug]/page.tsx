import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteEntries, publishedWebsite } from "@/server/website";
import { EntryBody } from "../../entry-body";
import { ShareButton } from "../../share-button";

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
  const cover = e.cover && /^(https:\/\/|\/)[^\s"'()]+$/.test(e.cover) ? e.cover : null;
  return (
    <article>
      <header
        className={`px-5 text-center ${cover ? "py-20 text-neutral-900 sm:py-28" : "py-14 text-white sm:py-20"}`}
        style={{ background: cover ? `linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.45)), url("${cover}") center/cover no-repeat` : "linear-gradient(135deg, var(--site), #171717)" }}
      >
        <h1 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{e.title}</h1>
        {e.summary && <p className={`mx-auto mt-4 max-w-2xl text-base sm:text-lg ${cover ? "font-medium text-neutral-800" : "text-white/85"}`}>{e.summary}</p>}
        <ShareButton title={e.title} light={!!cover} />
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14"><EntryBody body={e.body} /></div>
    </article>
  );
}
