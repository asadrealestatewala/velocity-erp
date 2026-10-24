import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { loginWorkspace } from "@/server/platform/login-workspace";
import { homePathFor } from "@/lib/home";
import { sp } from "@/lib/utils";
import { getDemoAccounts } from "@/server/demo";

export const metadata = { title: "Procurement sign in" };

export default async function ProcurementLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.scope, user.permissions));
  const params = await searchParams;
  return (
    <AuthLayout
      variant="procurement"
      title="Procurement Portal"
      subtitle="For YADEA's procurement and accounts team — dealership stock orders, dispatch, ledgers and vouchers."
      footer={
        <>
          Not procurement?{" "}
          <Link href="/login" className="link text-brand-600">Back to the central CRM sign-in →</Link>
        </>
      }
    >
      <LoginForm defaultWorkspace={await loginWorkspace()} portal="procurement" next={sp(params.next)} demo={await getDemoAccounts()} />
    </AuthLayout>
  );
}