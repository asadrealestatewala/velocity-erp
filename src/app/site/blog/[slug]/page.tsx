import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";
import { EntryBody } from "../../entry-body";
import { coverModels, postCover } from "../../post-cover";

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
  const cv = e.cover ? null : postCover(e, await coverModels());
  return (
    <article>
      <header className="px-5 py-12 text-white sm:py-16" style={{ background: e.cover ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.55)), url("${e.cover.replace(/["()\\]/g, "")}") center / cover` : "linear-gradient(135deg, var(--site), #171717)" }}>
        <div className="mx-auto max-w-3xl">
          <a href={`${base}/blog`} className="text-sm text-white/80 hover:underline">← All posts</a>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{e.title}</h1>
          <p className="mt-2 text-sm text-white/80">{fmtDate(e.date)}</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {cv && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cv.src} alt="" className="mb-8 aspect-[16/9] w-full rounded-2xl border border-neutral-200 bg-neutral-50 object-contain p-4" decoding="async" />
        )}
        <EntryBody body={e.body} />
      </div>
    </article>
  );
}
