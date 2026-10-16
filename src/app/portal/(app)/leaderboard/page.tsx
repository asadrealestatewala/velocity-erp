import { requirePortalPage } from "@/server/authz";
import { LeaderboardView } from "@/components/gamification/leaderboard-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Leaderboard" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage();
  const { flat } = parseListParams(await searchParams);
  return <LeaderboardView user={user} base="/portal" params={flat} />;
}