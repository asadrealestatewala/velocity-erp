"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { assignLeadAction, changeStageAction, scheduleFollowUpAction } from "@/server/actions/leads";
import { dealershipMembersAction, eligibleDealershipsAction } from "@/server/actions/lookups";

type Option = { id: string; name: string };

/** Assign / reassign a lead. mode "central" can pick any eligible dealership; "team" only changes the rep. */
export function AssignDialog({
  leadId,
  current,
  mode,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  leadId: string;
  current: { dealershipId: string | null; userId: string | null };
  mode: "central" | "team";
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [dealers, setDealers] = useState<(Option & { code: string; city: { name: string } })[]>([]);
  const [members, setMembers] = useState<(Option & { role: string })[]>([]);
  const [dealershipId, setDealershipId] = useState(current.dealershipId ?? "");
  const [userId, setUserId] = useState(current.userId ?? "");
  const [reason, setReason] = useState("");
  const { run, pending } = useAction(assignLeadAction, { onSuccess: () => setOpen(false) });

  useEffect(() => {
    if (!open || mode !== "central") return;
    eligibleDealershipsAction().then((r) => r.ok && setDealers(r.data ?? []));
  }, [open, mode]);
  useEffect(() => {
    if (!open || !dealershipId) return setMembers([]);
    dealershipMembersAction(dealershipId).then((r) => r.ok && setMembers(r.data ?? []));
  }, [open, dealershipId]);

  const changingDealer = dealershipId !== (current.dealershipId ?? "");
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === "central" ? (current.dealershipId ? "Reassign lead" : "Assign lead") : "Assign to a team member"}
      description={mode === "central" ? "Only active dealerships accepting leads are listed. History is preserved." : "Choose who in your dealership will work this lead."}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={pending}
            onClick={() =>
              run({ leadId, dealershipId: dealershipId || null, userId: changingDealer && !userId ? null : userId || null, reason: reason || undefined })
            }
          >
            Save assignment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === "central" && (
          <Field label="Dealership / outlet">
            {(p) => (
              <Select {...p} value={dealershipId} onChange={(e) => { setDealershipId(e.target.value); setUserId(""); }}>
                <option value="">— Unassigned (central queue) —</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>{d.city.name} · {d.name} ({d.code})</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {dealershipId && (
          <Field label="Sales representative" help="Optional — the dealership manager can assign later.">
            {(p) => (
              <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— Not assigned to a person —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.role === "MANAGER" ? " (Manager)" : ""}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Reason (optional)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer prefers DHA outlet" />}</Field>
      </div>
    </Dialog>
  );
}

export function FollowUpDialog({
  leadId,
  trigger,
  members,
  open: openProp,
  onOpenChange,
}: {
  leadId: string;
  trigger?: React.ReactNode;
  members?: Option[];
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const tomorrow = new Date(Date.now() + 86400_000);
  tomorrow.setHours(11, 0, 0, 0);
  const [dueAt, setDueAt] = useState(format(tomorrow, "yyyy-MM-dd'T'HH:mm"));
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"CALL" | "FOLLOW_UP" | "EMAIL" | "MEETING" | "OTHER">("CALL");
  const [assignedToId, setAssignedToId] = useState("");
  const { run, pending, fieldErrors } = useAction(scheduleFollowUpAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Schedule follow-up"
      description="Creates a task with a reminder and sets the lead's next follow-up date."
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} onClick={() => run({ leadId, dueAt: new Date(dueAt), title: title || undefined, type, assignedToId: assignedToId || undefined })}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When" required error={fieldErrors.dueAt}>{(p) => <Input {...p} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />}</Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="CALL">Call</option><option value="FOLLOW_UP">Follow-up</option><option value="EMAIL">Email</option><option value="MEETING">Meeting</option><option value="OTHER">Other</option>
            </Select>
          )}
        </Field>
        <Field label="Title" className="sm:col-span-2">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up with customer" />}</Field>
        {members && members.length > 0 && (
          <Field label="Assign to" className="sm:col-span-2" help="Defaults to the lead's representative, or you.">
            {(p) => (
              <Select {...p} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">Default</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export type Stage = { id: string; name: string; color: string; kind: "OPEN" | "WON" | "LOST" };

/** Dialog for terminal stages: LOST requires a reason; WON captures conversion details. */
export function StageOutcomeDialog({
  leadId,
  target,
  onClose,
  lossReasons,
  models,
  onDone,
}: {
  leadId: string | null;
  target: Stage | null;
  onClose: () => void;
  lossReasons: Option[];
  models: Option[];
  onDone?: () => void;
}) {
  const [lossReasonId, setLossReasonId] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [value, setValue] = useState("");
  const [soldModelId, setSoldModelId] = useState("");
  const [notes, setNotes] = useState("");
  const { run, pending, fieldErrors } = useAction(changeStageAction, {
    success: "Stage updated",
    onSuccess: () => {
      setLossReasonId(""); setLossNotes(""); setValue(""); setSoldModelId(""); setNotes("");
      onDone?.();
      onClose();
    },
  });
  return (
    <Dialog
      open={!!target && !!leadId}
      onOpenChange={(o) => !o && onClose()}
      title={target?.kind === "LOST" ? "Mark lead as lost" : "Convert to customer"}
      description={target?.kind === "LOST" ? "A loss reason is required for reporting." : "The contact becomes a customer — the same record, no duplicate is created."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={target?.kind === "LOST" ? "danger" : "primary"}
            loading={pending}
            onClick={() =>
              target && leadId &&
              run({
                leadId, stageId: target.id, lossReasonId: lossReasonId || null, lossNotes: lossNotes || null,
                conversionValue: value === "" ? null : Number(value), soldModelId: soldModelId || null, conversionNotes: notes || null,
              })
            }
          >
            {target?.kind === "LOST" ? "Mark as lost" : "Convert"}
          </Button>
        </>
      }
    >
      {target?.kind === "LOST" ? (
        <div className="space-y-4">
          <Field label="Loss reason" required error={fieldErrors.lossReasonId}>
            {(p) => (
              <Select {...p} value={lossReasonId} onChange={(e) => setLossReasonId(e.target.value)}>
                <option value="">Select a reason…</option>
                {lossReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Notes">{(p) => <Textarea {...p} value={lossNotes} onChange={(e) => setLossNotes(e.target.value)} />}</Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sale value (PKR)" help="Recognised sales revenue for reports">{(p) => <Input {...p} type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
          <Field label="Model sold">
            {(p) => (
              <Select {...p} value={soldModelId} onChange={(e) => setSoldModelId(e.target.value)}>
                <option value="">—</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Conversion notes" className="sm:col-span-2">{(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      )}
    </Dialog>
  );
}

/** Stage dropdown. Moving to LOST requires a reason; moving to WON captures conversion details. */
export function StageSelect({
  leadId,
  currentStageId,
  stages,
  lossReasons,
  models,
  disabled,
  compact,
}: {
  leadId: string;
  currentStageId: string;
  stages: Stage[];
  lossReasons: Option[];
  models: Option[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const [target, setTarget] = useState<Stage | null>(null);
  const { run, pending } = useAction(changeStageAction, { success: "Stage updated" });
  const current = stages.find((s) => s.id === currentStageId);
  return (
    <>
      <select
        aria-label="Lead stage"
        disabled={disabled || pending}
        value={currentStageId}
        onChange={(e) => {
          const s = stages.find((x) => x.id === e.target.value)!;
          if (s.kind === "OPEN") run({ leadId, stageId: s.id });
          else setTarget(s);
        }}
        className={compact ? "input h-8 w-auto py-1 pr-7 text-xs font-medium" : "input h-9 w-auto pr-8 font-medium"}
        style={current ? { color: current.color, borderColor: `${current.color}55` } : undefined}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {/* Mounted only when needed: tables render one StageSelect per row. */}
      {target && <StageOutcomeDialog leadId={leadId} target={target} onClose={() => setTarget(null)} lossReasons={lossReasons} models={models} />}
    </>
  );
}
