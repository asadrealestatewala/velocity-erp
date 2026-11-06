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
    <section className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Blog</h1>
      <div className="mt-2 h-1 w-16 rounded" style={{ backgroundColor: s.primaryColor }} />
      {posts.length === 0 ? <p className="mt-6 text-neutral-600">No posts yet.</p> : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.slug} className="flex">
              <a href={`${base}/blog/${p.slug}`} className="flex w-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderTop: `4px solid ${s.primaryColor}` }}>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{fmtDate(p.date)}</p>
                <span className="mt-2 text-lg font-semibold leading-snug text-neutral-900">{p.title}</span>
                {p.summary && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{p.summary}</p>}
                <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: s.primaryColor }}>Read more →</span>
              </a>
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
