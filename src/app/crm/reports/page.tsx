import { requireCentralPage } from "@/server/authz";
import { ReportsView } from "@/components/reports/reports-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Reports & analytics" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("reports.view");
  const { flat } = parseListParams(await searchParams);
  return <ReportsView user={user} base="/crm" params={flat} />;
}