import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { homePathFor } from "@/lib/home";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homePathFor(user.scope, user.permissions));
}