import { notFound } from "next/navigation";
import { getSiteEntries, parsePairs, publishedWebsite, siteBase } from "@/server/website";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await publishedWebsite();
  if (!s) notFound();
  const base = await siteBase();
  const entries = (await getSiteEntries()).filter((e) => e.published);
  const hasPosts = entries.some((e) => e.kind === "post");
  const wa = s.whatsapp.replace(/\D/g, "");
  return (
    <div className="min-h-dvh bg-white text-neutral-900" style={{ ["--site" as string]: s.primaryColor }}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <a href={base || "/"} className="text-lg font-bold" style={{ color: s.primaryColor }}>{s.siteName}</a>
        <nav className="flex items-center gap-4 text-sm font-medium">
          {s.showModels && <a href={`${base}/#models`}>Models</a>}
          {s.showInventory && <a href={`${base}/inventory`}>In stock</a>}
          {s.showShowrooms && <a href={`${base}/#showrooms`}>Showrooms</a>}
          {entries.filter((e) => e.kind === "page").map((e) => <a key={e.slug} href={`${base}/p/${e.slug}`}>{e.title}</a>)}
          {hasPosts && <a href={`${base}/blog`}>Blog</a>}
          {parsePairs(s.navLinksText).map((l) => <a key={l.a} href={l.b || "#"}>{l.a}</a>)}
          <a href="#contact">Contact</a>
        </nav>
      </header>
      {children}
      <footer id="contact" className="bg-neutral-900 px-5 py-12 text-neutral-200">
        <div className="mx-auto max-w-5xl space-y-1 text-sm">
          <p className="text-lg font-semibold text-white">{s.siteName}</p>
          {s.address && <p>{s.address}</p>}
          {s.phone && <p>Phone: <a href={`tel:${s.phone}`} className="underline">{s.phone}</a></p>}
          {wa && <p>WhatsApp: <a href={`https://wa.me/${wa}`} className="underline">+{wa}</a></p>}
          {s.email && <p>Email: <a href={`mailto:${s.email}`} className="underline">{s.email}</a></p>}
          {parsePairs(s.socialsText).length > 0 && (
            <p className="flex flex-wrap gap-4 pt-2">{parsePairs(s.socialsText).map((l) => <a key={l.a} href={l.b} className="underline" target="_blank" rel="noreferrer">{l.a}</a>)}</p>
          )}
          <p className="pt-4 text-xs text-neutral-500">© {new Date().getFullYear()} {s.siteName}</p>
        </div>
      </footer>
    </div>
  );
}
