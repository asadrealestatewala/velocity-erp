import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { loginWorkspace } from "@/server/platform/login-workspace";
import { homePathFor } from "@/lib/home";
import { sp } from "@/lib/utils";
import { getDemoAccounts } from "@/server/demo";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.scope, user.permissions));
  const params = await searchParams;
  return (
    <AuthLayout
      variant="crm"
      title="Sign in to YADEA CRM"
      subtitle="Central team access for sales, CRM and management."
      footer={
        <div className="space-y-1.5">
          <p>
            Dealership staff?{" "}
            <Link href="/portal/login" className="link text-brand-600">Go to the Dealer Portal →</Link>
          </p>
          <p>
            Procurement &amp; accounts?{" "}
            <Link href="/procurement/login" className="link text-brand-600">Go to the Procurement Portal →</Link>
          </p>
        </div>
      }
    >
      <LoginForm defaultWorkspace={await loginWorkspace()} portal="crm" next={sp(params.next)} demo={await getDemoAccounts()} />
    </AuthLayout>
  );
}