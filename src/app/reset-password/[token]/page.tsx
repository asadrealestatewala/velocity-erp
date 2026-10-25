import Link from "next/link";
import { db } from "@/lib/db";
import { sha256 } from "@/server/platform/crypto";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetForm } from "@/components/auth/account-forms";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  const valid = !!row && !row.usedAt && row.expiresAt > new Date();
  return (
    <AuthLayout brand="velocity"
      variant="crm"
      title={valid ? "Choose a new password" : "Link unavailable"}
      subtitle={valid ? "Pick a strong password. You will be signed out everywhere and asked to sign in again." : "This reset link is invalid, already used, or has expired."}
      footer={<p><Link href={valid ? "/login" : "/forgot-password"} className="link text-brand-600">{valid ? "← Back to sign in" : "Request a new link →"}</Link></p>}
    >
      {valid ? <ResetForm token={token} /> : null}
    </AuthLayout>
  );
}
