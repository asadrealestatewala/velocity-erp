import type { Metadata } from "next";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return { title: s ? `Blog · ${s.siteName}` : "Blog", robots: s ? undefined : { index: false } };
}

export default async function BlogIndex() {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const posts = (await getSiteEntries()).filter((e) => e.kind === "post" && e.published).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">Blog</h1>
      {posts.length === 0 ? <p className="mt-6 text-neutral-600">No posts yet.</p> : (
        <ul className="mt-6 space-y-6">
          {posts.map((p) => (
            <li key={p.slug} className="border-b border-neutral-200 pb-6">
              <p className="text-xs text-neutral-500">{fmtDate(p.date)}</p>
              <a href={`${base}/blog/${p.slug}`} className="text-xl font-semibold hover:underline" style={{ color: s.primaryColor }}>{p.title}</a>
              {p.summary && <p className="mt-2 text-neutral-700">{p.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
