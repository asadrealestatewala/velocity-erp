import { requirePortalPage } from "@/server/authz";
import { TestDrivesView } from "@/components/test-drives/test-drives-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Test drives" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("testdrives.view");
  const { flat } = parseListParams(await searchParams);
  return <TestDrivesView user={user} base="/portal" params={flat} />;
}