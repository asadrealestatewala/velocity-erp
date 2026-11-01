"use client";
import { ReasonButton } from "@/components/platform/console";
import { bulkUpdateTicketsAction } from "@/server/actions/platform-bulk";

const ticked = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked')).map((e) => e.value);

/** Bulk buttons for the ticket list. Reads the ticked rows when confirmed, so the list can stay a server component. */
export function BulkTickets() {
  const btn = (label: string, action: "resolve" | "reopen" | "assign-me", description: string) => (
    <ReasonButton label={label} title={label} description={description} withReason={false} variant="secondary" confirmLabel={label} action={() => bulkUpdateTicketsAction({ ids: ticked(), action })} />
  );
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {btn("Resolve ticked", "resolve", "Marks every ticked ticket as resolved.")}
      {btn("Reopen ticked", "reopen", "Moves every ticked ticket back to open.")}
      {btn("Assign ticked to me", "assign-me", "Makes you the owner of every ticked ticket.")}
    </div>
  );
}
