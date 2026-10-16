"use client";
import { useAction } from "@/components/ui/use-action";
import { assignLeadAction } from "@/server/actions/leads";

/** Inline rep picker for dealership managers (stays within the lead's dealership). */
export function TeamAssignSelect({ leadId, dealershipId, current, members }: { leadId: string; dealershipId: string; current: string | null; members: { id: string; name: string }[] }) {
  const { run, pending } = useAction(assignLeadAction, { success: "Representative assigned" });
  return (
    <select
      aria-label="Assign sales representative"
      className="input h-8 w-36 py-0 pr-7 text-xs"
      value={current ?? ""}
      disabled={pending}
      onChange={(e) => run({ leadId, dealershipId, userId: e.target.value || null })}
    >
      <option value="">Unassigned</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}
