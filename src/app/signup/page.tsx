import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { homePathFor } from "@/lib/home";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignupForm } from "@/components/auth/signup-form";
import { getPlatformSettings } from "@/server/platform/settings";
import { appBaseUrl } from "@/server/platform/mail";

export const metadata = { title: "Create your workspace", description: "Start a free trial: your own private CRM workspace for your dealer network.", robots: { index: true, follow: true } };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.scope, user.permissions));
  const settings = await getPlatformSettings();
  return (
    <AuthLayout
      variant="crm"
      title="Create your workspace"
      subtitle={settings.trialDays > 0 ? `Free for ${settings.trialDays} days. No card needed.` : "Set up your company's CRM in minutes."}
      footer={<p>Already have a workspace? <Link href="/login" className="link text-brand-600">Sign in</Link></p>}
    >
      <SignupForm baseUrl={appBaseUrl().replace(/^https?:\/\//, "")} trialDays={settings.trialDays} />
    </AuthLayout>
  );
}
