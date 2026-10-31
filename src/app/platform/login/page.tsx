import { redirect } from "next/navigation";
import { PlatformLoginCard } from "@/components/platform/login-card";
import { getAdmin } from "@/server/platform/admin-auth";
import { platformDemoLogin } from "@/server/platform/demo-login";

export const metadata = { title: { absolute: "Platform sign-in · Velocity" }, icons: { icon: "/brand/velocity-app-icon.png" } };
export const dynamic = "force-dynamic";

export default async function PlatformLoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await getAdmin()) redirect("/platform");
  const { reset } = await searchParams;
  return <PlatformLoginCard demo={platformDemoLogin()} notice={reset === "1" ? "Your password was changed. Sign in with the new one." : undefined} />;
}
