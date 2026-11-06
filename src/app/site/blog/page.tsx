import type { Metadata } from "next";
import { fmtDate } from "@/lib/utils";
import { getSiteEntries, publishedWebsite, siteBase } from "@/server/website";

const PER_PAGE = 12;
const okImg = (u?: string) => (u && /^(https:\/\/|\/)[^\s"'()]+$/.test(u) ? u : null);


export async function generateMetadata(): Promise<Metadata> {
  const s = await publishedWebsite();
  return { title: s ? `Blog · ${s.siteName}` : "Blog", robots: s ? undefined : { index: false } };
}

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const s = (await publishedWebsite())!;
  const base = await siteBase();
  const posts = (await getSiteEntries()).filter((e) => e.kind === "post" && e.published).sort((a, b) => b.date.localeCompare(a.date));
  const pageCount = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number((await searchParams).p) || 1), page    <section>
      {feature ? (
        <a href={`${base}/blog/${feature.slug}`} className="relative block px-5 py-20 text-white sm:py-28" style={{ background: okImg(feature.cover) ? `linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.65)), url("${okImg(feature.cover)}") center/cover no-repeat` : "linear-gradient(135deg, var(--site), #171717)" }}>
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Latest · {fmtDate(feature.date)}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">{feature.title}</h1>
            {feature.summary && <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{feature.summary}</p>}
            <span className="mt-6 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900">Read the story →</span>
          </div>
        </a>
      ) : (
        <div className="px-5 py-16 text-center text-white" style={{ background: "linear-gradient(135deg, var(--site), #171717)" }}><h1 className="text-4xl font-extrabold">Blog</h1></div>
      )}
      <div className="mx-auto max-w-5xl px-5 py-12">
      {posts.length === 0 ? <p className="text-neutral-600">No posts yet.</p> : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.slug} className="flex">
              <a href={`${base}/blog/${p.slug}`} className="flex w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="aspect-[16/9] w-full bg-neutral-100" style={{ background: okImg(p.cover) ? `url("${okImg(p.cover)}") center/cover no-repeat` : `linear-gradient(135deg, ${s.primaryColor}, #171717)` }} />
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{fmtDate(p.date)}</p>
                  <span className="mt-2 text-lg font-semibold leading-snug text-neutral-900">{p.title}</span>
                  {p.summary && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{p.summary}</p>}
                  <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: s.primaryColor }}>Read more →</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
more →</span>
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
      </div>
    </section>
  );
}