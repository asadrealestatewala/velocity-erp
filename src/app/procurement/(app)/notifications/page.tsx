import { requireProcurementPage } from "@/server/authz";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { parseListParams } from "@/components/ui/table";

export const metadata = { title: "Notifications" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementPage();
  const { flat } = parseListParams(await searchParams);
  return <NotificationsView user={user} base="/procurement" params={flat} />;
}
