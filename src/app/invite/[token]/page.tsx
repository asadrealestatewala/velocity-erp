import Link from "next/link";
import { db } from "@/lib/db";
import { sha256 } from "@/server/platform/crypto";
import { currentTenant } from "@/server/platform/runtime";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AcceptInviteForm } from "@/components/auth/account-forms";

export const metadata = { title: "Accept your invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [ws, inv] = await Promise.all([currentTenant(), db.userInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { role: true } })]);
  const valid = !!inv && !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date();
  return (
    <AuthLayout
      variant="crm"
      title={valid ? `Join ${ws.name}` : "Invitation unavailable"}
      subtitle={valid ? `You have been invited as ${inv!.role.name}. Choose a password to get started.` : "This invitation link is invalid, already used, or has expired."}
      footer={<p>{valid ? <>Already have an account? <Link href="/login" className="link text-brand-600">Sign in</Link></> : "Need a new invitation? Ask your administrator to send one."}</p>}
    >
      {valid ? <AcceptInviteForm token={token} email={inv!.email} suggestedName={inv!.name ?? undefined} /> : null}
    </AuthLayout>
  );
}
