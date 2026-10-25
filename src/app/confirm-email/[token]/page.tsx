import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { confirmWorkspaceEmail } from "@/server/platform/accounts";
import { workspaceUrl } from "@/server/platform/mail";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tenant = await confirmWorkspaceEmail(token);
  return (
    <AuthLayout brand="velocity"
      variant="crm"
      title={tenant ? "Email confirmed" : "Link unavailable"}
      subtitle={tenant ? "Thanks. You can now invite your team." : "This confirmation link is invalid, already used, or has expired. Sign in and request a new one from Settings."}
      footer={<p>{tenant ? <Link href={workspaceUrl(tenant.slug, "/login")} className="link text-brand-600">Go to your workspace →</Link> : <Link href="/login" className="link text-brand-600">Go to sign in →</Link>}</p>}
    >
      <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-4 text-sm ${tenant ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
        {tenant ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />}
        <p>{tenant ? `${tenant.ownerEmail} is confirmed for ${tenant.name}.` : "We could not confirm that link."}</p>
      </div>
    </AuthLayout>
  );
}
