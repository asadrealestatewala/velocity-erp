import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { sp } from "@/lib/utils";
import { getDemoAccounts } from "@/server/demo";

export const metadata = { title: "Dealer Portal sign in" };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.scope === "CENTRAL" ? "/crm/dashboard" : "/portal/dashboard");
  const params = await searchParams;
  return (
    <AuthLayout
      variant="portal"
      title="Dealer Portal"
      subtitle="Sign in with the account your dealership manager or YADEA created for you."
      footer={
        <>
          YADEA head-office team?{" "}
          <Link href="/login" className="link text-brand-600">
            Sign in to the central CRM →
          </Link>
        </>
      }
    >
      <LoginForm portal="portal" next={sp(params.next)} demo={await getDemoAccounts()} />
    </AuthLayout>
  );
}
