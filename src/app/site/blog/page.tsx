import type { Metadata } from "next";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";

const PER_PAGE = 12;

export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return { title: s ? `Blog · ${s.siteName}` : "Blog", robots: s ? undefined : { index: false } };
}

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const posts = (await getSiteEntries()).filter((e) => e.kind === "post" && e.published).sort((a, b) => b.date.localeCompare(a.date));
  const pageCount = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number((await searchParams).p) || 1), pageCount);
  const shown = posts.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  return (
    <section className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">Blog</h1>
      {posts.length === 0 ? <p className="mt-6 text-neutral-600">No posts yet.</p> : (
        <ul className="mt-6 space-y-6">
          {shown.map((p) => (
            <li key={p.slug} className="border-b border-neutral-200 pb-6">
              <p className="text-xs text-neutral-500">{fmtDate(p.date)}</p>
              <a href={`${base}/blog/${p.slug}`} className="text-xl font-semibold hover:underline" style={{ color: s.primaryColor }}>{p.title}</a>
              {p.summary && <p className="mt-2 text-neutral-700">{p.summary}</p>}
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4 text-sm font-semibold">
          {page > 1 && <a href={`${base}/blog?p=${page - 1}`} style={{ color: s.primaryColor }}>← Newer</a>}
          <span className="text-neutral-500">Page {page} of {pageCount}</span>
          {page < pageCount && <a href={`${base}/blog?p=${page + 1}`} style={{ color: s.primaryColor }}>Older →</a>}
        </nav>
      )}
    </section>
  );
}
