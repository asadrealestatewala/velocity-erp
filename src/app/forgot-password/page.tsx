import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotForm } from "@/components/auth/account-forms";
import { loginWorkspace } from "@/server/platform/login-workspace";

export const metadata = { title: "Forgot password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  return (
    <AuthLayout brand="velocity" variant="crm" title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one." footer={<p><Link href="/login" className="link text-brand-600">← Back to sign in</Link></p>}>
      <ForgotForm defaultWorkspace={await loginWorkspace()} />
    </AuthLayout>
  );
}
