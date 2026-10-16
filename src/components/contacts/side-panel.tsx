"use client";
import { useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Activity as ActivityIcon, ArrowRightLeft, Bike, CheckCircle2, CheckSquare, CircleDollarSign, Download, FileText, FileUp, Flag, Mail,
  MessageCircle, MessageSquare, Phone, Pin, PinOff, Plus, StickyNote, Trash2, UserPlus, Users, XCircle, Inbox, Pencil,
} from "lucide-react";
import { cn, fmtDate, fmtDateTime, fmtMoney, fmtRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { DOC_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUS, PAYMENT_TYPES, TASK_PRIORITY, TASK_STATUS, TASK_TYPES } from "@/lib/constants";
import {
  addNoteAction, createTaskAction, deleteDocumentAction, recordPaymentAction, setTaskStatusAction, updateNoteAction, updatePaymentStatusAction, uploadDocumentAction,
} from "@/server/actions/work";

type Activity = { id: string; type: string; title: string; body: string | null; outcome: string | null; occurredAt: Date; user: { name: string } | null };
type Task = { id: string; title: string; description: string | null; type: string; dueAt: Date; priority: string; status: string; assignedTo: { id: string; name: string }; completedAt: Date | null };
type Note = { id: string; body: string; isPinned: boolean; visibility: string; createdAt: Date; updatedAt: Date; dealershipId: string | null; author: { id: string; name: string } };
type Doc = { id: string; name: string; category: string; description: string | null; createdAt: Date; uploadedBy: { name: string }; file: { id: string; originalName: string; mimeType: string; size: number } };
type Payment = { id: string; reference: string; type: string; amount: number; currency: string; paymentDate: Date; method: string; status: string; transactionRef: string | null; description: string | null; recordedBy: { name: string } };

const ACT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  LEAD_CREATED: UserPlus, FORM_SUBMITTED: Inbox, LEAD_ASSIGNED: Users, LEAD_REASSIGNED: ArrowRightLeft, CALL_LOGGED: Phone, EMAIL_LOGGED: Mail,
  WHATSAPP_LOGGED: MessageCircle, SMS_LOGGED: MessageSquare, MEETING_LOGGED: Users, NOTE_ADDED: StickyNote, TASK_CREATED: CheckSquare,
  TASK_COMPLETED: CheckCircle2, TEST_DRIVE_SCHEDULED: Bike, TEST_DRIVE_RESCHEDULED: Bike, TEST_DRIVE_COMPLETED: Bike, TEST_DRIVE_UPDATED: Bike,
  STAGE_CHANGED: Flag, DOCUMENT_UPLOADED: FileUp, PAYMENT_RECORDED: CircleDollarSign, LEAD_CONVERTED: CheckCircle2, LEAD_LOST: XCircle,
  CONTACT_UPDATED: Pencil, SOURCE_CHANGED: ArrowRightLeft,
};
const ACT_TONE: Record<string, string> = {
  LEAD_CONVERTED: "bg-emerald-100 text-emerald-700", LEAD_LOST: "bg-red-100 text-red-700", FORM_SUBMITTED: "bg-blue-100 text-blue-700",
  PAYMENT_RECORDED: "bg-emerald-50 text-emerald-700", STAGE_CHANGED: "bg-violet-100 text-violet-700",
};

const TABS = [
  { key: "activity", label: "Activity", icon: ActivityIcon },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "payments", label: "Payments", icon: CircleDollarSign },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ContactSidePanel(props: {
  contactId: string;
  leadId: string | null;
  meId: string;
  central: boolean;
  members: { id: string; name: string }[];
  can: { tasks: boolean; notes: boolean; docsView: boolean; docsManage: boolean; paymentsView: boolean; paymentsManage: boolean };
  activities: Activity[];
  tasks: Task[];
  notes: Note[];
  documents: Doc[];
  payments: Payment[];
}) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabs = TABS.filter((t) => (t.key === "tasks" ? props.can.tasks : t.key === "documents" ? props.can.docsView : t.key === "payments" ? props.can.paymentsView : true));
  const initial = (search.get("tab") as TabKey) || "activity";
  const [tab, setTab] = useState<TabKey>(tabs.some((t) => t.key === initial) ? initial : "activity");
  const counts: Partial<Record<TabKey, number>> = {
    tasks: props.tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length,
    notes: props.notes.length,
    documents: props.documents.length,
    payments: props.payments.length,
  };
  const select = (k: TabKey) => {
    setTab(k);
    const p = new URLSearchParams(search.toString());
    p.set("tab", k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="card flex flex-col overflow-hidden xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)]">
      <div role="tablist" aria-label="Contact records" className="scrollbar-thin flex shrink-0 overflow-x-auto border-b border-ink-100 px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => select(t.key)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.key === tab);
              if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length]!.key);
              if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length]!.key);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-medium transition-colors",
              tab === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {!!counts[t.key] && <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">{counts[t.key]}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {tab === "activity" && <ActivityTab items={props.activities} />}
        {tab === "tasks" && <TasksTab {...props} />}
        {tab === "notes" && <NotesTab {...props} />}
        {tab === "documents" && <DocumentsTab {...props} />}
        {tab === "payments" && <PaymentsTab {...props} />}
      </div>
    </div>
  );
}

function ActivityTab({ items }: { items: Activity[] }) {
  if (!items.length) return <p className="py-10 text-center text-sm text-ink-400">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-ink-200">
      {items.map((a) => {
        const Icon = ACT_ICON[a.type] ?? ActivityIcon;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white", ACT_TONE[a.type] ?? "bg-ink-100 text-ink-600")}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-ink-900">{a.title}</p>
              {a.body && <p className="mt-0.5 text-[13px] whitespace-pre-line text-ink-600">{a.body}</p>}
              <p className="mt-1 text-xs text-ink-400" title={fmtDateTime(a.occurredAt)}>
                {a.user?.name ?? "System"} · {fmtDateTime(a.occurredAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TasksTab({ contactId, leadId, tasks, meId, members }: Parameters<typeof ContactSidePanel>[0]) {
  const [showForm, setShowForm] = useState(false);
  const defaultDue = new Date(Date.now() + 86400_000);
  defaultDue.setHours(11, 0, 0, 0);
  const [f, setF] = useState({ title: "", description: "", type: "FOLLOW_UP", dueAt: format(defaultDue, "yyyy-MM-dd'T'HH:mm"), priority: "MEDIUM", assignedToId: meId, reminderMinutesBefore: "60" });
  const create = useAction(createTaskAction, { onSuccess: () => { setShowForm(false); setF((x) => ({ ...x, title: "", description: "" })); } });
  const status = useAction(setTaskStatusAction);
  const people = members.some((m) => m.id === meId) ? members : [{ id: meId, name: "Me" }, ...members];
  return (
    <div className="space-y-3">
      {!showForm ? (
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New task</Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
          <Field label="Title" required error={create.fieldErrors.title}>{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TASK_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Priority">{(p) => <Select {...p} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
            <Field label="Due" error={create.fieldErrors.dueAt}>{(p) => <Input {...p} type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />}</Field>
            <Field label="Reminder">{(p) => <Select {...p} value={f.reminderMinutesBefore} onChange={(e) => setF({ ...f, reminderMinutesBefore: e.target.value })}><option value="">None</option><option value="15">15 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></Select>}</Field>
          </div>
          <Field label="Assigned to" error={create.fieldErrors.assignedToId}>{(p) => <Select {...p} value={f.assignedToId} onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>{people.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? `${m.name} (me)` : m.name}</option>)}</Select>}</Field>
          <Field label="Description">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" loading={create.pending} onClick={() => create.run({ ...f, type: f.type as "CALL", priority: f.priority as "LOW", dueAt: new Date(f.dueAt), contactId, leadId, reminderMinutesBefore: f.reminderMinutesBefore === "" ? null : Number(f.reminderMinutesBefore) })}>Create task</Button>
          </div>
        </div>
      )}
      {tasks.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No tasks for this contact.</p>}
      <ul className="space-y-2">
        {tasks.map((t) => {
          const open = t.status === "OPEN" || t.status === "IN_PROGRESS";
          const overdue = open && new Date(t.dueAt) < new Date();
          return (
            <li key={t.id} className={cn("rounded-xl border p-3", overdue ? "border-red-200 bg-red-50/40" : "border-ink-200")}>
              <div className="flex items-start gap-2">
                <button
                  disabled={!open || status.pending}
                  onClick={() => status.run(t.id, "COMPLETED")}
                  aria-label={`Complete task ${t.title}`}
                  className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", open ? "border-ink-300 hover:border-emerald-500 hover:bg-emerald-50" : "border-emerald-500 bg-emerald-500 text-white")}
                >
                  {!open && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", open ? "text-ink-900" : "text-ink-400 line-through")}>{t.title}</p>
                  {t.description && <p className="text-xs text-ink-500">{t.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="gray">{TASK_TYPES[t.type as keyof typeof TASK_TYPES]}</Badge>
                    <Badge tone={TASK_PRIORITY[t.priority]!.tone}>{TASK_PRIORITY[t.priority]!.label}</Badge>
                    {!open && <Badge tone={TASK_STATUS[t.status]!.tone}>{TASK_STATUS[t.status]!.label}</Badge>}
                    <span className={cn("text-xs", overdue ? "font-semibold text-red-600" : "text-ink-500")}>{overdue ? "Overdue · " : ""}{fmtDateTime(t.dueAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{t.assignedTo.name}</p>
                </div>
                {open && (
                  <button onClick={() => status.run(t.id, "CANCELLED")} className="text-xs text-ink-400 hover:text-red-600" aria-label={`Cancel task ${t.title}`}>Cancel</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotesTab({ contactId, leadId, notes, meId, central, can: perms }: Parameters<typeof ContactSidePanel>[0]) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [shareable, setShareable] = useState(false);
  const [centralOnly, setCentralOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const add = useAction(addNoteAction, { onSuccess: () => { setBody(""); setPinned(false); setShareable(false); } });
  const upd = useAction(updateNoteAction, { onSuccess: () => setEditing(null) });
  return (
    <div className="space-y-3">
      {perms.notes && (
        <div className="space-y-2 rounded-xl border border-ink-200 p-3">
          <label className="sr-only" htmlFor="note-body">New note</label>
          <Textarea id="note-body" rows={3} placeholder="Add a note…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Checkbox label="Pin" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <Checkbox label="Approved for customer communication" checked={shareable} onChange={(e) => setShareable(e.target.checked)} />
            {central && <Checkbox label="Central team only" checked={centralOnly} onChange={(e) => setCentralOnly(e.target.checked)} />}
            <Button size="sm" className="ml-auto" disabled={!body.trim()} loading={add.pending} onClick={() => add.run(contactId, leadId, { body, isPinned: pinned, visibility: shareable ? "CUSTOMER_SHAREABLE" : "INTERNAL", centralOnly })}>Add note</Button>
          </div>
        </div>
      )}
      {notes.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No notes yet.</p>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className={cn("rounded-xl border p-3", n.isPinned ? "border-brand-200 bg-brand-50/40" : "border-ink-200")}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {n.isPinned && <Badge tone="brand"><Pin className="h-3 w-3" /> Pinned</Badge>}
              <Badge tone={n.visibility === "CUSTOMER_SHAREABLE" ? "green" : "gray"}>{n.visibility === "CUSTOMER_SHAREABLE" ? "Customer-shareable" : "Internal"}</Badge>
              {central && !n.dealershipId && <Badge tone="dark">Central only</Badge>}
              {perms.notes && (
                <span className="ml-auto flex gap-1">
                  <button className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={n.isPinned ? "Unpin note" : "Pin note"} onClick={() => upd.run(n.id, { isPinned: !n.isPinned })}>
                    {n.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  {n.author.id === meId && (
                    <button className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Edit note" onClick={() => { setEditing(n.id); setEditBody(n.body); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              )}
            </div>
            {editing === n.id ? (
              <div className="space-y-2">
                <Textarea rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} aria-label="Edit note" />
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button size="xs" loading={upd.pending} onClick={() => upd.run(n.id, { body: editBody })}>Save</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-line text-ink-800">{n.body}</p>
            )}
            <p className="mt-1.5 text-xs text-ink-400">
              {n.author.name} · {fmtDateTime(n.createdAt)}
              {n.updatedAt.getTime() - n.createdAt.getTime() > 1000 && ` · edited ${fmtRelative(n.updatedAt)}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentsTab({ contactId, leadId, documents, can: perms }: Parameters<typeof ContactSidePanel>[0]) {
  const formRef = useRef<HTMLFormElement>(null);
  const up = useAction(uploadDocumentAction, { onSuccess: () => formRef.current?.reset() });
  const del = useAction(deleteDocumentAction);
  return (
    <div className="space-y-3">
      {perms.docsManage && (
        <form
          ref={formRef}
          className="space-y-2 rounded-xl border border-dashed border-ink-300 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (leadId) fd.set("leadId", leadId);
            up.run(contactId, fd);
          }}
        >
          <Field label="File" help="PDF, DOCX, XLSX, JPG, PNG or WEBP · max 10 MB" error={up.fieldErrors.file}>{(p) => <input {...p} name="file" type="file" required accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-ink-200" />}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">{(p) => <Input {...p} name="name" placeholder="Defaults to file name" />}</Field>
            <Field label="Category">{(p) => <Select {...p} name="category" defaultValue="Other">{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
          </div>
          <Field label="Description">{(p) => <Input {...p} name="description" />}</Field>
          <div className="flex justify-end"><Button size="sm" type="submit" loading={up.pending}><FileUp className="h-4 w-4" /> Upload</Button></div>
        </form>
      )}
      {documents.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No documents uploaded.</p>}
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id} className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600"><FileText className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <a href={`/api/files/${d.file.id}`} target="_blank" rel="noreferrer" className="link block truncate text-sm">{d.name}</a>
              <p className="text-xs text-ink-500">{d.category} · {(d.file.size / 1024).toFixed(0)} KB · {d.uploadedBy.name} · {fmtDateTime(d.createdAt)}</p>
              {d.description && <p className="mt-0.5 text-xs text-ink-600">{d.description}</p>}
            </div>
            <a href={`/api/files/${d.file.id}?download=1`} className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Download ${d.name}`}><Download className="h-4 w-4" /></a>
            {perms.docsManage && (
              <ConfirmButton
                trigger={<button className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${d.name}`}><Trash2 className="h-4 w-4" /></button>}
                title="Remove document?"
                description="The document will no longer be listed or downloadable. The stored file is retained for audit purposes."
                confirmLabel="Remove"
                onConfirm={() => del.run(d.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentsTab({ contactId, leadId, payments, can: perms }: Parameters<typeof ContactSidePanel>[0]) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ type: "DEPOSIT", amount: "", currency: "PKR", paymentDate: format(new Date(), "yyyy-MM-dd"), method: "CASH", status: "PAID", transactionRef: "", description: "" });
  const rec = useAction(recordPaymentAction, { onSuccess: () => { setShow(false); setF((x) => ({ ...x, amount: "", transactionRef: "", description: "" })); } });
  const upd = useAction(updatePaymentStatusAction);
  const totals = payments.reduce(
    (a, p) => {
      a[p.status] = (a[p.status] ?? 0) + p.amount;
      return a;
    },
    {} as Record<string, number>,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 p-2"><p className="text-[11px] font-medium text-emerald-700 uppercase">Paid</p><p className="text-sm font-bold text-emerald-900 tabular-nums">{fmtMoney(totals.PAID ?? 0)}</p></div>
        <div className="rounded-xl bg-amber-50 p-2"><p className="text-[11px] font-medium text-amber-700 uppercase">Pending</p><p className="text-sm font-bold text-amber-900 tabular-nums">{fmtMoney(totals.PENDING ?? 0)}</p></div>
        <div className="rounded-xl bg-violet-50 p-2"><p className="text-[11px] font-medium text-violet-700 uppercase">Refunded</p><p className="text-sm font-bold text-violet-900 tabular-nums">{fmtMoney(totals.REFUNDED ?? 0)}</p></div>
      </div>
      <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">Payments are recorded manually and are not independently verified. No payment provider is connected.</p>
      {perms.paymentsManage && (!show ? (
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Record payment</Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(PAYMENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Amount" required error={rec.fieldErrors.amount}>{(p) => <Input {...p} type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
            <Field label="Currency">{(p) => <Input {...p} maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />}</Field>
            <Field label="Date">{(p) => <Input {...p} type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />}</Field>
            <Field label="Method">{(p) => <Select {...p} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Status">{(p) => <Select {...p} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
          </div>
          <Field label="Transaction reference">{(p) => <Input {...p} value={f.transactionRef} onChange={(e) => setF({ ...f, transactionRef: e.target.value })} />}</Field>
          <Field label="Description">{(p) => <Input {...p} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShow(false)}>Cancel</Button>
            <Button size="sm" loading={rec.pending} onClick={() => rec.run(contactId, { ...f, amount: Number(f.amount), paymentDate: new Date(f.paymentDate), type: f.type as "DEPOSIT", method: f.method as "CASH", status: f.status as "PAID", leadId })}>Save payment</Button>
          </div>
        </div>
      ))}
      {payments.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No payments recorded.</p>}
      <ul className="space-y-2">
        {payments.map((p) => (
          <li key={p.id} className="rounded-xl border border-ink-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink-900 tabular-nums">{fmtMoney(p.amount, p.currency)}</p>
                <p className="text-xs text-ink-500">{PAYMENT_TYPES[p.type as keyof typeof PAYMENT_TYPES]} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]} · {fmtDate(p.paymentDate)}</p>
              </div>
              {perms.paymentsManage ? (
                <select aria-label="Payment status" className="input h-7 w-auto py-0 pr-7 text-xs" value={p.status} disabled={upd.pending} onChange={(e) => upd.run(p.id, e.target.value as "PAID")}>
                  {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <Badge tone={PAYMENT_STATUS[p.status]!.tone}>{PAYMENT_STATUS[p.status]!.label}</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-400">{p.reference}{p.transactionRef ? ` · Txn ${p.transactionRef}` : ""} · by {p.recordedBy.name}</p>
            {p.description && <p className="mt-0.5 text-xs text-ink-600">{p.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
