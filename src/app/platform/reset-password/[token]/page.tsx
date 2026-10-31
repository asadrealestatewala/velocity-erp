import { PlatformResetCard } from "@/components/platform/recovery-forms";

export const metadata = { title: { absolute: "Choose a new password · Velocity Platform" }, robots: { index: false, follow: false } };

export default async function PlatformResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return <PlatformResetCard token={(await params).token} />;
}
