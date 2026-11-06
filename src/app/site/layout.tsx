import { notFound } from "next/navigation";
import { Montserrat } from "next/font/google";
import { MobileMenu, type MenuLink } from "./mobile-menu";
import { getSiteEntries, parsePairs, publishedWebsite, siteBase } from "@/server/website";

const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await publishedWebsite();
  if (!s) notFound();
  const base = await siteBase();
  const entries = (await getSiteEntries()).filter((e) => e.published);
  const hasPosts = entries.some((e) => e.kind === "post");
  const links: MenuLink[] = [
    ...(s.showModels ? [{ label: "Models", href: `${base}/#models` }] : []),
    ...(s.showInventory ? [{ label: "In stock", href: `${base}/inventory` }] : []),
    ...(s.showShowrooms ? [{ label: "Showrooms", href: `${base}/showrooms` }] : []),
    ...entries.filter((e) => e.kind === "page" && e.inMenu !== false).map((e) => ({ label: e.title, href: `${base}/p/${e.slug}` })),
    ...(hasPosts ? [{ label: "Blog", href: `${base}/blog` }] : []),
    ...parsePairs(s.navLinksText).map((l) => ({ label: l.a, href: l.b || "#" })),
    { label: "Contact", href: "#contact" },
  ];
  const testDrive = s.testDriveFormSlug ? `/forms/${s.testDriveFormSlug}` : null;
  const wa = s.whatsapp.replace(/\D/g, "");
  return (
    <div className={`min-h-dvh bg-white text-neutral-900 ${montserrat.className}`} style={{ ["--site" as string]: s.primaryColor }}>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="relative flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 md:py-3">
          <a href={base || "/"} className="shrink-0 text-lg font-bold" style={{ color: s.primaryColor }}>
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt={s.siteName} className="h-8 w-auto" fetchPriority="high" />
            ) : s.siteName}
          </a>
          <nav aria-label="Main" className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm font-medium md:flex">
            {links.map((l) => <a key={l.label + l.href} href={l.href}>{l.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {testDrive && (
              <a href={testDrive} className="rounded-full px-3.5 py-2 text-xs font-semibold text-white md:hidden" style={{ backgroundColor: s.primaryColor }}>Book a test drive</a>
            )}
            <MobileMenu links={links} color={s.primaryColor} />
          </div>
        </div>
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
          {entries.some((e) => e.kind === "page") && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 pt-2">{entries.filter((e) => e.kind === "page").map((e) => <a key={e.slug} href={`${base}/p/${e.slug}`} className="underline">{e.title}</a>)}</p>
          )}
          <p className="pt-4 text-xs text-neutral-500">© {new Date().getFullYear()} {s.siteName}</p>
        </div>
      </footer>
    </div>
  );
}
