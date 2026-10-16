import { requirePortalPage } from "@/server/authz";
import { ReportsView } from "@/components/reports/reports-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Analytics" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("reports.view");
  const { flat } = parseListParams(await searchParams);
  return <ReportsView user={user} base="/portal" params={flat} />;
}