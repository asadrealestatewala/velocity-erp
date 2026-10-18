import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { requireProcurementPage, can } from "@/server/authz";

export default async function Forbidden() {
  const user = await requireProcurementPage();
  const home = can(user, "procurement.view") ? "/procurement/dashboard" : "/procurement/notifications";
  return (
    <div className="card">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Your role doesn't include the permission required here. Ask a Super Administrator if you need access."
        action={<ButtonLink href={home} variant="secondary">Go back</ButtonLink>}
      />
    </div>
  );
}
