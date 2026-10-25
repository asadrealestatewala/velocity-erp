import { redirect } from "next/navigation";
import { PlatformLoginCard } from "@/components/platform/login-card";
import { getAdmin } from "@/server/platform/admin-auth";

export const metadata = { title: { absolute: "Platform sign-in · Velocity" }, icons: { icon: "/brand/velocity-app-icon.png" } };
export const dynamic = "force-dynamic";

export default async function PlatformLoginPage() {
  if (await getAdmin()) redirect("/platform");
  return <PlatformLoginCard />;
}
