"use client";
import { ReasonButton } from "@/components/platform/console";
import { bulkExtendTrialAction } from "@/server/actions/platform-bulk";

/** Reads the ticked rows (checkboxes named `ids` in the page) when the owner confirms, so the list can stay a server component. */
export function BulkExtendTrial() {
  return (
    <ReasonButton
      label="Extend trials for ticked"
      title="Extend trials"
      description="Adds days to the free trial of every ticked workspace that is on a trial. The others are skipped. Each owner is emailed."
      extra={[{ name: "days", label: "Days to add", type: "number", defaultValue: 7 }]}
      variant="secondary"
      action={(p: { days: number; reason: string }) => {
        const ids = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked')).map((e) => e.value);
        return bulkExtendTrialAction({ ids, days: p.days, reason: p.reason });
      }}
    />
  );
}
