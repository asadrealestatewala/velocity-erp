import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PageHit } from "./page-hit";

const PLATFORM = process.env.PLATFORM_NAME || "YADEA CRM";

/** Header and footer shared by every public marketing page. */
export function SiteShell({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={`${PLATFORM} home`} className="flex items-center gap-2">
            <Image src="/brand/yadea-logo-dark.png" alt="YADEA" width={120} height={26} className="h-6 w-auto" priority />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <Link href="/#features" className="hidden rounded-lg px-3 py-2 text-ink-600 hover:bg-ink-50 sm:block">Features</Link>
            <Link href="/pricing" className="rounded-lg px-3 py-2 text-ink-600 hover:bg-ink-50">Pricing</Link>
            <Link href="/login" className="rounded-lg px-3 py-2 text-ink-600 hover:bg-ink-50">Sign in</Link>
            <ButtonLink href="/signup" size="sm">Start free trial</ButtonLink>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-ink-100 bg-ink-50/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} {PLATFORM}. All rights reserved.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/pricing" className="hover:underline">Pricing</Link>
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/signup" className="hover:underline">Create a workspace</Link>
          </nav>
        </div>
      </footer>
      <PageHit path={path} />
    </div>
  );
}
