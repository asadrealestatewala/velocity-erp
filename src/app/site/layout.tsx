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
    { label: "Contact", href: `${base}/#contact` },
  ];
  const socials = parsePairs(s.socialsText).filter((l) => /^https?:\/\//.test(l.b));
  const quick: MenuLink[] = [
    ...(s.showModels ? [{ label: "Models", href: `${base}/#models` }] : []),
    ...(s.showShowrooms ? [{ label: "Showrooms", href: `${base}/#showrooms` }] : []),
    ...entries.filter((e) => e.kind === "page" && /about|support|dealer/i.test(e.slug)).map((e) => ({ label: e.title, href: `${base}/p/${e.slug}` })),
    ...(hasPosts ? [{ label: "Blog", href: `${base}/blog` }] : []),
  ];
  const footerPages = entries.filter((e) => e.kind === "page");
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
      <footer id="contact" className="bg-neutral-900 px-5 pb-8 pt-12 text-neutral-300">
        <div className="mx-auto grid max-w-6xl gap-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt={s.siteName} className="h-8 w-auto rounded bg-white px-2 py-1" />
            ) : <p className="text-lg font-bold text-white">{s.siteName}</p>}
            {s.tagline && <p className="max-w-xs leading-6 text-neutral-400">{s.tagline}</p>}
            {socials.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {socials.map((l) => (
                  <li key={l.a}><a href={l.b} target="_blank" rel="noreferrer" aria-label={l.a} className="inline-flex items-center rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-transparent">{l.a}</a></li>
                ))}
              </ul>
            )}
          </div>
          <nav aria-label="Quick links" className="space-y-3">
            <p className="font-semibold uppercase tracking-wide text-white">Quick links</p>
            <ul className="space-y-2">{quick.map((l) => <li key={l.label + l.href}><a href={l.href} className="hover:text-white">{l.label}</a></li>)}</ul>
          </nav>
          <nav aria-label="Legal" className="space-y-3">
            <p className="font-semibold uppercase tracking-wide text-white">Information</p>
            <ul className="space-y-2">{footerPages.map((e) => <li key={e.slug}><a href={`${base}/p/${e.slug}`} className="hover:text-white">{e.title}</a></li>)}</ul>
          </nav>
          <div className="space-y-3">
            <p className="font-semibold uppercase tracking-wide text-white">Contact</p>
            <ul className="space-y-2">
              {s.phone && <li><span className="text-neutral-500">{/111/.test(s.phone) ? "UAN" : "Phone"}:</span> <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-white">{s.phone}</a></li>}
              {wa && <li><span className="text-neutral-500">WhatsApp:</span> <a href={`https://wa.me/${wa}`} className="text-white">+{wa}</a></li>}
              {s.email && <li><span className="text-neutral-500">Email:</span> <a href={`mailto:${s.email}`} className="text-white">{s.email}</a></li>}
              {s.address && <li className="leading-6">{s.address}</li>}
            </ul>
            {testDrive && <a href={testDrive} className="mt-2 inline-block rounded-full px-5 py-2.5 text-xs font-semibold text-white" style={{ backgroundColor: s.primaryColor }}>Book a test drive</a>}
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-neutral-800 pt-5 text-xs text-neutral-500">© {new Date().getFullYear()} {s.siteName}. All rights reserved.</p>
      </footer>
    </div>
  );
}
