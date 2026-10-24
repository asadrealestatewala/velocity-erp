import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { loginWorkspace } from "@/server/platform/login-workspace";
import { homePathFor } from "@/lib/home";
import { sp } from "@/lib/utils";
import { getDemoAccounts } from "@/server/demo";

export const metadata = { title: "Dealer Portal sign in" };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.scope, user.permissions));
  const params = await searchParams;
  return (
    <AuthLayout
      variant="portal"
      title="Dealer Portal"
      subtitle="Sign in with your email address or mobile number and the password your dealership manager or YADEA gave you."
      footer={
        <>
          YADEA head-office team?{" "}
          <Link href="/login" className="link text-brand-600">Sign in to the central CRM →</Link>
        </>
      }
    >
      <LoginForm defaultWorkspace={await loginWorkspace()} portal="portal" next={sp(params.next)} demo={await getDemoAccounts()} />
    </AuthLayout>
  );
}