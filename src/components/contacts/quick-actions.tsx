"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bike, CalendarClock, Camera, Mail, MessageSquarePlus, Pencil, Phone, Plus, Share2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { AssignDialog, FollowUpDialog } from "@/components/leads/lead-dialogs";
import { logInteractionAction, addLeadToContactAction } from "@/server/actions/leads";
import { createTestDriveAction } from "@/server/actions/test-drives";
import { uploadAvatarAction } from "@/server/actions/contacts";
import { dealershipMembersAction, eligibleDealershipsAction } from "@/server/actions/lookups";
import { INTERACTION_TYPES } from "@/lib/constants";

type Opt = { id: string; name: string };

export function ContactQuickActions({
  base,
  contactId,
  phone,
  email,
  lead,
  can,
  models,
  members,
}: {
  base: string;
  contactId: string;
  phone: string | null;
  email: string | null;
  lead: { id: string; dealershipId: string | null; userId: string | null; interestedModelId: string | null } | null;
  can: { edit: boolean; log: boolean; followUp: boolean; assign: "central" | "team" | null; testDrive: boolean; addLead: boolean };
  models: Opt[];
  members: Opt[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && <Link href={`${base}/contacts/${contactId}/edit`} className={buttonClass("secondary", "sm")}><Pencil className="h-4 w-4" /> Edit</Link>}
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className={buttonClass("secondary", "sm")}><Phone className="h-4 w-4" /> Call</a>}
      {email && <a href={`mailto:${email}`} className={buttonClass("secondary", "sm")}><Mail className="h-4 w-4" /> Email</a>}
      {can.log && <LogInteractionDialog contactId={contactId} leadId={lead?.id ?? null} />}
      {lead && can.followUp && <FollowUpDialog leadId={lead.id} members={members} trigger={<Button variant="secondary" size="sm"><CalendarClock className="h-4 w-4" /> Follow-up</Button>} />}
      {lead && can.assign && (
        <AssignDialog leadId={lead.id} current={{ dealershipId: lead.dealershipId, userId: lead.userId }} mode={can.assign} trigger={<Button variant="secondary" size="sm"><Share2 className="h-4 w-4" /> Assign</Button>} />
      )}
      {can.testDrive && <BookTestDriveDialog contactId={contactId} lead={lead} models={models} />}
      {can.addLead && <AddLeadDialog contactId={contactId} models={models} />}
    </div>
  );
}

function LogInteractionDialog({ contactId, leadId }: { contactId: string; leadId: string | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "CALL_LOGGED", direction: "OUTBOUND", outcome: "", body: "" });
  const { run, pending } = useAction(logInteractionAction, { onSuccess: () => { setOpen(false); setF({ type: "CALL_LOGGED", direction: "OUTBOUND", outcome: "", body: "" }); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button size="sm"><MessageSquarePlus className="h-4 w-4" /> Log interaction</Button>}
      title="Log an interaction"
      description="Calls, emails, WhatsApp/SMS messages and meetings appear on the activity timeline."
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(contactId, { ...f, type: f.type as "CALL_LOGGED", direction: f.direction as "OUTBOUND", leadId })}>Save</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Channel">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(INTERACTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Direction">{(p) => <Select {...p} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="OUTBOUND">Outbound (we contacted them)</option><option value="INBOUND">Inbound (they contacted us)</option></Select>}</Field>
        <Field label="Outcome" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
              <option value="">—</option>
              {["Interested", "Not interested", "No answer", "Call back later", "Wrong number", "Requested information", "Booked test drive"].map((o) => <option key={o}>{o}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Details" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

function BookTestDriveDialog({ contactId, lead, models }: { contactId: string; lead: { id: string; dealershipId: string | null; interestedModelId: string | null } | null; models: Opt[] }) {
  const [open, setOpen] = useState(false);
  const tomorrow = new Date(Date.now() + 86400_000);
  const [f, setF] = useState({ bikeModelId: lead?.interestedModelId ?? "", dealershipId: lead?.dealershipId ?? "", date: format(tomorrow, "yyyy-MM-dd"), time: "11:00", assignedUserId: "", customerNotes: "", internalNotes: "", confirmNow: true });
  const [outlets, setOutlets] = useState<(Opt & { city: { name: string } })[]>([]);
  const [reps, setReps] = useState<Opt[]>([]);
  const { run, pending, fieldErrors } = useAction(createTestDriveAction, { onSuccess: () => setOpen(false) });
  useEffect(() => {
    if (!open) return;
    eligibleDealershipsAction(f.bikeModelId || undefined).then((r) => {
      if (!r.ok) return;
      setOutlets(r.data ?? []);
      if (f.dealershipId && !(r.data ?? []).some((o) => o.id === f.dealershipId)) setF((x) => ({ ...x, dealershipId: "" }));
    });
  }, [open, f.bikeModelId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !f.dealershipId) return setReps([]);
    dealershipMembersAction(f.dealershipId).then((r) => r.ok && setReps(r.data ?? []));
  }, [open, f.dealershipId]);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={<Button variant="secondary" size="sm"><Bike className="h-4 w-4" /> Book test drive</Button>}
      title="Book a test drive"
      description="Only outlets configured for the chosen model are listed. Opening hours and slot capacity are enforced."
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run({ ...f, contactId, leadId: lead?.id ?? null })}>Book</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bike model" required error={fieldErrors.bikeModelId}>{(p) => <Select {...p} value={f.bikeModelId} onChange={(e) => setF({ ...f, bikeModelId: e.target.value })}><option value="">Select…</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
        <Field label="Outlet" required error={fieldErrors.dealershipId}>
          {(p) => <Select {...p} value={f.dealershipId} onChange={(e) => setF({ ...f, dealershipId: e.target.value, assignedUserId: "" })}><option value="">{outlets.length ? "Select…" : "No eligible outlet"}</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.city.name} · {o.name}</option>)}</Select>}
        </Field>
        <Field label="Date" required error={fieldErrors.scheduledAt ?? fieldErrors.date}>{(p) => <Input {...p} type="date" min={format(new Date(), "yyyy-MM-dd")} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        <Field label="Time" required error={fieldErrors.time}>{(p) => <Input {...p} type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field>
        <Field label="Representative">{(p) => <Select {...p} value={f.assignedUserId} onChange={(e) => setF({ ...f, assignedUserId: e.target.value })}><option value="">—</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
        <div className="flex items-end pb-2"><Checkbox label="Confirmed with the customer" checked={f.confirmNow} onChange={(e) => setF({ ...f, confirmNow: e.target.checked })} /></div>
        <Field label="Customer notes" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={f.customerNotes} onChange={(e) => setF({ ...f, customerNotes: e.target.value })} />}</Field>
        <Field label="Internal notes" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={f.internalNotes} onChange={(e) => setF({ ...f, internalNotes: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

function AddLeadDialog({ contactId, models }: { contactId: string; models: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ interestedModelId: "", description: "", inquiryType: "MANUAL" });
  const { run, pending } = useAction(addLeadToContactAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="ghost" size="sm"><Plus className="h-4 w-4" /> New inquiry</Button>}
      title="Add a new inquiry / lead"
      description="Use this when an existing contact makes a new, separate inquiry. Previous leads keep their history."
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(contactId, { ...f, inquiryType: f.inquiryType as "MANUAL" })}>Create lead</Button></>}
    >
      <div className="space-y-4">
        <Field label="Interested model">{(p) => <Select {...p} value={f.interestedModelId} onChange={(e) => setF({ ...f, interestedModelId: e.target.value })}><option value="">—</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
        <Field label="Description">{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

export function AvatarUpload({ contactId, enabled }: { contactId: string; enabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const { run, pending } = useAction(uploadAvatarAction);
  if (!enabled) return null;
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        disabled={pending}
        className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-white ring-2 ring-white hover:bg-brand-600"
        aria-label="Upload customer picture"
      >
        <Camera className="h-3.5 w-3.5" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          run(contactId, fd);
          e.target.value = "";
        }}
      />
    </>
  );
}
