import { requireCentralPage } from "@/server/authz";
import { TasksView } from "@/components/tasks/tasks-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Tasks" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCentralPage("tasks.manage");
  const { flat } = parseListParams(await searchParams);
  return <TasksView user={user} base="/crm" params={flat} />;
}
