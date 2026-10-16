"use client";
import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import { createTaskAction, setTaskStatusAction } from "@/server/actions/work";
import { TASK_PRIORITY, TASK_TYPES } from "@/lib/constants";

export function TaskRowActions({ taskId, status, mode }: { taskId: string; status: string; mode: "check" | "menu" }) {
  const { run, pending } = useAction(setTaskStatusAction);
  const open = status === "OPEN" || status === "IN_PROGRESS";
  if (mode === "check")
    return (
      <button
        disabled={!open || pending}
        onClick={() => run(taskId, "COMPLETED")}
        aria-label="Mark task complete"
        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", open ? "border-ink-300 hover:border-emerald-500 hover:bg-emerald-50" : "border-emerald-500 bg-emerald-500 text-white")}
      >
        {!open && <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>
    );
  return (
    <Menu trigger={<Button variant="ghost" size="iconSm" aria-label="Task actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
      {open && status !== "IN_PROGRESS" && <MenuItem onSelect={() => run(taskId, "IN_PROGRESS")}>Mark in progress</MenuItem>}
      {open && <MenuItem onSelect={() => run(taskId, "COMPLETED")}>Complete</MenuItem>}
      {open && <MenuItem danger onSelect={() => run(taskId, "CANCELLED")}>Cancel task</MenuItem>}
      {!open && <MenuItem onSelect={() => run(taskId, "OPEN")}>Re-open</MenuItem>}
    </Menu>
  );
}

export function NewTaskButton({ people, meId }: { people: { id: string; name: string }[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const due = new Date(Date.now() + 86400_000);
  due.setHours(11, 0, 0, 0);
  const [f, setF] = useState({ title: "", description: "", type: "FOLLOW_UP", dueAt: format(due, "yyyy-MM-dd'T'HH:mm"), priority: "MEDIUM", assignedToId: meId, reminderMinutesBefore: "60" });
  const { run, pending, fieldErrors } = useAction(createTaskAction, { onSuccess: () => { setOpen(false); setF((x) => ({ ...x, title: "", description: "" })); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button><Plus className="h-4 w-4" /> New task</Button>}
      title="New task"
      description="To link a task to a customer, create it from the contact's Tasks tab."
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} onClick={() => run({ ...f, type: f.type as "CALL", priority: f.priority as "LOW", dueAt: new Date(f.dueAt), reminderMinutesBefore: f.reminderMinutesBefore ? Number(f.reminderMinutesBefore) : null })}>Create</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2" error={fieldErrors.title}>{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TASK_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Priority">{(p) => <Select {...p} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        <Field label="Due" error={fieldErrors.dueAt}>{(p) => <Input {...p} type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />}</Field>
        <Field label="Reminder">{(p) => <Select {...p} value={f.reminderMinutesBefore} onChange={(e) => setF({ ...f, reminderMinutesBefore: e.target.value })}><option value="">None</option><option value="15">15 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></Select>}</Field>
        <Field label="Assigned to" className="sm:col-span-2" error={fieldErrors.assignedToId}>{(p) => <Select {...p} value={f.assignedToId} onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>{people.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? `${m.name} (me)` : m.name}</option>)}</Select>}</Field>
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}
