import { requirePortalPage } from "@/server/authz";
import { PipelineView } from "@/components/leads/pipeline-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Pipeline" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("contacts.view");
  const { flat } = parseListParams(await searchParams);
  return <PipelineView user={user} base="/portal" params={flat} />;
}