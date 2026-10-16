import { requireCentralPage } from "@/server/authz";
import { PipelineView } from "@/components/leads/pipeline-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Leads pipeline" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("contacts.view");
  const { flat } = parseListParams(await searchParams);
  return <PipelineView user={user} base="/crm" params={flat} />;
}
