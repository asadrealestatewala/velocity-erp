import { requireCentralPage } from "@/server/authz";
import { AccountPage } from "@/components/account/account-page";

export const metadata = { title: "Account" };

export default async function Page() {
  return <AccountPage user={await requireCentralPage()} />;
}