import { redirect } from "next/navigation";
import { PlatformLoginForm } from "@/components/platform/console";
import { getAdmin } from "@/server/platform/admin-auth";

export const metadata = { title: "Platform sign-in" };
export const dynamic = "force-dynamic";

export default async function PlatformLoginPage() {
  if (await getAdmin()) redirect("/platform");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Platform console</p>
        <h1 className="mt-1 mb-5 text-xl font-bold text-slate-900">Sign in</h1>
        <PlatformLoginForm />
        <p className="mt-4 text-xs text-slate-500">For platform operators only. Company staff sign in from the main sign-in page with their workspace code.</p>
      </div>
    </main>
  );
}
