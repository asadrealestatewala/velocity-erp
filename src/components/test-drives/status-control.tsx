"use client";
import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { updateTestDriveStatusAction } from "@/server/actions/test-drives";
import { TEST_DRIVE_STATUS } from "@/lib/constants";

type Status = "REQUESTED" | "CONFIRMED" | "RESCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

// Mirrors the server-side transition table (the server enforces it regardless).
const NEXT: Record<Status, Status[]> = {
  REQUESTED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "RESCHEDULED", "CANCELLED", "NO_SHOW"],
  RESCHEDULED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ["RESCHEDULED"],
};
const VERB: Record<Status, string> = { REQUESTED: "Request", CONFIRMED: "Confirm", RESCHEDULED: "Reschedule", COMPLETED: "Mark completed", CANCELLED: "Cancel", NO_SHOW: "Mark no-show" };

export function TestDriveStatusControl({ bookingId, status, canManage }: { bookingId: string; status: Status; canManage: boolean }) {
  const [target, setTarget] = useState<Status | null>(null);
  const [date, setDate] = useState(format(new Date(Date.now() + 86400_000), "yyyy-MM-dd"));
  const [time, setTime] = useState("11:00");
  const [feedback, setFeedback] = useState("");
  const { run, pending, fieldErrors } = useAction(updateTestDriveStatusAction, { onSuccess: () => setTarget(null) });
  const s = TEST_DRIVE_STATUS[status]!;
  const options = NEXT[status];
  return (
    <div className="flex items-center gap-2">
      <Badge tone={s.tone}>{s.label}</Badge>
      {canManage && options.length > 0 && (
        <select
          aria-label="Update test-drive status"
          className="input h-7 w-auto py-0 pr-7 text-xs"
          value=""
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value as Status;
            if (v === "RESCHEDULED" || v === "COMPLETED") setTarget(v);
            else if (v) run({ bookingId, status: v });
          }}
        >
          <option value="">Update…</option>
          {options.map((o) => <option key={o} value={o}>{VERB[o]}</option>)}
        </select>
      )}
      {target && <Dialog
        open
        onOpenChange={(o) => !o && setTarget(null)}
        size="sm"
        title={target === "RESCHEDULED" ? "Reschedule test drive" : "Complete test drive"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button loading={pending} onClick={() => target && run({ bookingId, status: target, date, time, feedback: feedback || undefined })}>Save</Button>
          </>
        }
      >
        {target === "RESCHEDULED" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="New date" error={fieldErrors.scheduledAt}>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="New time">{(p) => <Input {...p} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
            <p className="col-span-2 text-xs text-ink-500">The booking returns to “awaiting confirmation” until it is confirmed again.</p>
          </div>
        ) : (
          <Field label="Customer feedback" help="Optional — how did the ride go?">{(p) => <Textarea {...p} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}</Field>
        )}
      </Dialog>}
    </div>
  );
}
