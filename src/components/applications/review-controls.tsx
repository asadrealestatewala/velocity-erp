"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { addApplicationNoteAction, assignReviewerAction, convertApplicationAction, markOnboardingStepAction, setApplicationStatusAction } from "@/server/actions/applications";
import { addTeamMemberAction } from "@/server/actions/team";
import { setAcceptsLeadsAction, setDealershipStatusAction } from "@/server/actions/dealerships";
import { APPLICATION_STATUS } from "@/lib/constants";

const NEXT: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["INFO_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"],
  INFO_REQUIRED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: ["UNDER_REVIEW"],
  WITHDRAWN: [],
};
const VERB: Record<string, string> = { UNDER_REVIEW: "Start review", INFO_REQUIRED: "Request information", APPROVED: "Approve", REJECTED: "Reject", WITHDRAWN: "Mark withdrawn" };

export function ReviewPanel({ id, status, reviewerId, reviewers }: { id: string; status: string; reviewerId: string | null; reviewers: { id: string; name: string }[] }) {
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const st = useAction(setApplicationStatusAction, { onSuccess: () => { setTarget(null); setNote(""); } });
  const rv = useAction(assignReviewerAction);
  const needsNote = target === "APPROVED" || target === "REJECTED" || target === "INFO_REQUIRED";
  return (
    <div className="space-y-4 p-5">
      <Field label="Reviewer">
        {(p) => (
          <Select {...p} value={reviewerId ?? ""} onChange={(e) => rv.run(id, e.target.value || null)} disabled={rv.pending}>
            <option value="">Unassigned</option>
            {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        {NEXT[status]!.map((s) => (
          <Button key={s} size="sm" variant={s === "APPROVED" ? "primary" : s === "REJECTED" ? "danger" : "secondary"} onClick={() => setTarget(s)}>{VERB[s]}</Button>
        ))}
        {NEXT[status]!.length === 0 && <p className="text-sm text-ink-500">No further review actions — {status === "APPROVED" ? "continue with onboarding." : "this application is closed."}</p>}
      </div>
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `${VERB[target]} — ${APPLICATION_STATUS[target]!.label}` : ""}
        description={target === "APPROVED" ? "Approval does not activate a dealership. Onboarding steps follow." : target === "INFO_REQUIRED" ? "The applicant receives this message by email (if SMTP is configured)." : undefined}
        footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button variant={target === "REJECTED" ? "danger" : "primary"} loading={st.pending} onClick={() => target && st.run(id, { status: target as "APPROVED", note: note || undefined })}>Confirm</Button></>}
      >
        <Field label={target === "INFO_REQUIRED" ? "Information requested" : target === "APPROVED" || target === "REJECTED" ? "Reason for decision" : "Note (optional)"} required={needsNote} error={st.fieldErrors.note}>
          {(p) => <Textarea {...p} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Dialog>
    </div>
  );
}

export function ReviewNoteForm({ id }: { id: string }) {
  const [body, setBody] = useState("");
  const { run, pending } = useAction(addApplicationNoteAction, { onSuccess: () => setBody("") });
  return (
    <div className="space-y-2 border-t border-ink-100 p-4">
      <Textarea aria-label="Internal review note" rows={2} placeholder="Add an internal review note…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end"><Button size="sm" disabled={!body.trim()} loading={pending} onClick={() => run(id, body)}>Add note</Button></div>
    </div>
  );
}

type Onboarding = {
  approved: boolean; verified: boolean; dealership: { id: string; name: string; status: string; acceptsLeads: boolean; models: number; managers: number } | null; notified: boolean;
};

/** The controlled onboarding sequence: each step unlocks the next; activation is a separate, explicit step. */
export function OnboardingChecklist({ id, o, applicant, cities, defaults }: { id: string; o: Onboarding; applicant: { name: string; email: string; phone: string }; cities: { id: string; name: string }[]; defaults: { name: string; cityId: string | null; address: string } }) {
  const router = useRouter();
  const verify = useAction(markOnboardingStepAction);
  const notifyStep = useAction(markOnboardingStepAction);
  const convert = useAction(convertApplicationAction, { onSuccess: () => setConvOpen(false) });
  const invite = useAction(addTeamMemberAction, { onSuccess: (d) => d?.tempPassword && setSecret(d.tempPassword) });
  const status = useAction(setDealershipStatusAction);
  const leads = useAction(setAcceptsLeadsAction);
  const [convOpen, setConvOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [c, setC] = useState({ name: defaults.name, code: "", type: "DEALERSHIP", cityId: defaults.cityId ?? "", address: defaults.address });
  const d = o.dealership;

  const steps: { title: string; done: boolean; enabled: boolean; body: React.ReactNode }[] = [
    { title: "Application approved", done: o.approved, enabled: true, body: o.approved ? "Approved by a reviewer." : "Approve the application first." },
    {
      title: "Verify business information", done: o.verified, enabled: o.approved,
      body: <Button size="sm" variant="secondary" disabled={!o.approved || o.verified} loading={verify.pending} onClick={() => verify.run(id, "verified", true)}>{o.verified ? "Verified" : "Mark verified"}</Button>,
    },
    {
      title: "Create the dealership & outlet", done: !!d, enabled: o.verified,
      body: d ? <Link href={`/crm/dealerships/${d.id}`} className="link text-brand-600">{d.name} ({d.status.toLowerCase()}) →</Link> : <Button size="sm" variant="secondary" disabled={!o.verified} onClick={() => setConvOpen(true)}>Create dealership</Button>,
    },
    {
      title: "Invite the dealership manager", done: !!d && d.managers > 0, enabled: !!d,
      body: d && d.managers === 0 ? <Button size="sm" variant="secondary" loading={invite.pending} onClick={() => invite.run({ dealershipId: d.id, email: applicant.email, name: applicant.name, phone: applicant.phone, role: "MANAGER" })}>Invite {applicant.email}</Button> : d ? `${d.managers} manager(s)` : "—",
    },
    { title: "Configure eligible bike models", done: !!d && d.models > 0, enabled: !!d, body: d ? <Link href={`/crm/dealerships/${d.id}`} className="link text-brand-600">{d.models ? `${d.models} model(s) configured` : "Configure on the dealership page →"}</Link> : "—" },
    {
      title: "Activate dealership & lead assignment", done: !!d && d.status === "ACTIVE" && d.acceptsLeads, enabled: !!d && d.managers > 0 && d.models > 0,
      body: d ? (
        <div className="flex flex-wrap gap-2">
          {d.status !== "ACTIVE" && <Button size="sm" variant="secondary" loading={status.pending} disabled={!(d.managers > 0 && d.models > 0)} onClick={() => status.run(d.id, "ACTIVE", "Onboarding complete")}>Activate dealership</Button>}
          {d.status === "ACTIVE" && !d.acceptsLeads && <Button size="sm" loading={leads.pending} onClick={() => leads.run(d.id, true)}>Enable lead assignment</Button>}
        </div>
      ) : "—",
    },
    {
      title: "Send onboarding notification", done: o.notified, enabled: !!d && d.status === "ACTIVE" && d.acceptsLeads,
      body: <Button size="sm" variant="secondary" disabled={!(d && d.status === "ACTIVE" && d.acceptsLeads) || o.notified} loading={notifyStep.pending} onClick={() => notifyStep.run(id, "notified", true)}>{o.notified ? "Sent" : "Notify applicant & team"}</Button>,
    },
  ];

  return (
    <>
      <ol className="space-y-1 p-3">
        {steps.map((s, i) => (
          <li key={s.title} className={cn("flex gap-3 rounded-xl p-3", s.enabled && !s.done ? "bg-brand-50/60" : "")}>
            {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className={cn("mt-0.5 h-5 w-5 shrink-0", s.enabled ? "text-brand-500" : "text-ink-300")} />}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", s.enabled || s.done ? "text-ink-900" : "text-ink-400")}>{i + 1}. {s.title}</p>
              <div className="mt-1.5 text-sm text-ink-600">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <Dialog
        open={convOpen}
        onOpenChange={setConvOpen}
        title="Create dealership from application"
        description="The dealership starts as Pending and will not receive leads until activated."
        footer={<><Button variant="secondary" onClick={() => setConvOpen(false)}>Cancel</Button><Button loading={convert.pending} onClick={() => convert.run(id, { ...c, type: c.type as "DEALERSHIP" }).then((r) => r.ok && router.refresh())}>Create</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dealership name" required className="sm:col-span-2" error={convert.fieldErrors.name}>{(p) => <Input {...p} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />}</Field>
          <Field label="Code" required error={convert.fieldErrors.code} help="e.g. FSD-02">{(p) => <Input {...p} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Type">{(p) => <Select {...p} value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}><option value="DEALERSHIP">Dealership</option><option value="OUTLET">Outlet</option><option value="FRANCHISE">Franchise</option><option value="SUB_DEALER">Sub-dealer</option></Select>}</Field>
          <Field label="City" required error={convert.fieldErrors.cityId}>{(p) => <Select {...p} value={c.cityId} onChange={(e) => setC({ ...c, cityId: e.target.value })}><option value="">Select…</option>{cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
          <Field label="Outlet address">{(p) => <Input {...p} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />}</Field>
        </div>
      </Dialog>
      <Dialog open={!!secret} onOpenChange={(o2) => !o2 && setSecret(null)} title="Manager account created" description="Temporary password — shown once. The manager must change it at first sign-in." size="sm">
        <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-white">
          <span className="flex-1 select-all">{secret}</span>
          <button aria-label="Copy password" onClick={() => { void navigator.clipboard.writeText(secret ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" /></button>
        </div>
      </Dialog>
    </>
  );
}
