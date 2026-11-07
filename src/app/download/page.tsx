import { Smartphone, Download } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata = {
  title: "Download the app",
  description: "Get the Velocity ERP app for Android. iPhone users can add the site to their home screen.",
  robots: { index: true, follow: true },
};

export default function DownloadPage() {
  return (
    <SiteShell path="/download">
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Smartphone className="size-6" aria-hidden /></span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Velocity ERP on your phone</h1>
        <p className="mt-2 text-ink-600">One app for staff, dealers and procurement. Sign in with your usual workspace account.</p>

        <div className="mt-8 rounded-2xl border border-ink-100 p-6">
          <h2 className="text-xl font-bold">Android</h2>
          <p className="mt-1 mb-4 text-sm text-ink-600">Download the APK, open it, and allow &ldquo;install unknown apps&rdquo; for your browser if Android asks. Play Store listing coming soon.</p>
          <ButtonLink href="/downloads/velocity-erp.apk" size="lg"><Download className="mr-2 size-4" aria-hidden />Download for Android</ButtonLink>
        </div>

        <div className="mt-5 rounded-2xl border border-ink-100 p-6">
          <h2 className="text-xl font-bold">iPhone and iPad</h2>
          <p className="mt-1 text-sm text-ink-600">The App Store app is coming soon. For now, open this site in Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;.</p>
        </div>
      </section>
    </SiteShell>
  );
}
