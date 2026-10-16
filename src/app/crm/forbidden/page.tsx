import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="card">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Your role doesn't include the permission required here. Ask a Super Administrator if you need access."
        action={<ButtonLink href="/crm/dashboard" variant="secondary">Back to dashboard</ButtonLink>}
      />
    </div>
  );
}
