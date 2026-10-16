"use client";
import { useState } from "react";
import { Copy, KeyRound, Power, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/ui/confirm";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { setAcceptsLeadsAction, setDealershipModelsAction, setDealershipStatusAction } from "@/server/actions/dealerships";
import { addTeamMemberAction, resetMemberPasswordAction, updateMembershipAction } from "@/server/actions/team";

export function StatusControls({ id, status, acceptsLeads }: { id: string; status: string; acceptsLeads: boolean }) {
  const st = useAction(setDealershipStatusAction);
  const leads = useAction(setAcceptsLeadsAction);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Dealership status" className="input h-9 w-auto pr-8" value={status} disabled={st.pending} onChange={(e) => st.run(id, e.target.value as "ACTIVE")}>
        <option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="INACTIVE">Inactive</option>
      </select>
      <Button variant={acceptsLeads ? "secondary" : "primary"} loading={leads.pending} onClick={() => leads.run(id, !acceptsLeads)}>
        <Power className="h-4 w-4" /> {acceptsLeads ? "Pause lead assignment" : "Enable lead assignment"}
      </Button>
    </div>
  );
}

export function ModelsEditor({ id, models, selected }: { id: string; models: { id: string; name: string; isActive: boolean }[]; selected: string[] }) {
  const [sel, setSel] = useState(new Set(selected));
  const { run, pending } = useAction(setDealershipModelsAction);
  const changed = sel.size !== selected.length || selected.some((s) => !sel.has(s));
  return (
    <div className="space-y-3 p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {models.map((m) => (
          <Checkbox key={m.id} label={<>{m.name}{!m.isActive && <Badge tone="gray" className="ml-1.5">inactive</Badge>}</>} checked={sel.has(m.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(m.id); else n.delete(m.id); setSel(n); }} />
        ))}
      </div>
      <div className="flex justify-end"><Button size="sm" disabled={!changed} loading={pending} onClick={() => run(id, [...sel])}>Save models</Button></div>
    </div>
  );
}

type Member = { id: string; role: "MANAGER" | "SALES_REP"; isActive: boolean; user: { id: string; name: string; email: string; lastLoginAt: Date | null } };

/** Team management — central staff can appoint managers; dealership managers can add reps. */
export function TeamPanel({ dealershipId, members, canAppointManagers, meId }: { dealershipId: string; members: Member[]; canAppointManagers: boolean; meId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: canAppointManagers ? "MANAGER" : "SALES_REP" });
  const [secret, setSecret] = useState<{ email: string; pw: string } | null>(null);
  const add = useAction(addTeamMemberAction, {
    onSuccess: (d) => {
      setOpen(false);
      if (d?.tempPassword) setSecret({ email: f.email, pw: d.tempPassword });
      setF((x) => ({ ...x, name: "", email: "", phone: "" }));
    },
  });
  const upd = useAction(updateMembershipAction);
  const reset = useAction(resetMemberPasswordAction, { onSuccess: (d) => d && setSecret({ email: "the user", pw: d.tempPassword }) });
  return (
    <div>
      <ul className="divide-y divide-ink-100">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{m.user.name} {!m.isActive && <Badge tone="gray">Removed</Badge>}</p>
              <p className="truncate text-xs text-ink-500">{m.user.email} · last sign-in {m.user.lastLoginAt ? new Date(m.user.lastLoginAt).toLocaleDateString("en-GB") : "never"}</p>
            </div>
            {canAppointManagers && m.isActive && m.user.id !== meId ? (
              <select aria-label="Member role" className="input h-8 w-auto py-0 pr-7 text-xs" value={m.role} onChange={(e) => upd.run(m.id, { role: e.target.value as "MANAGER" })}>
                <option value="MANAGER">Manager</option><option value="SALES_REP">Sales rep</option>
              </select>
            ) : (
              <Badge tone={m.role === "MANAGER" ? "brand" : "gray"}>{m.role === "MANAGER" ? "Manager" : "Sales rep"}</Badge>
            )}
            {m.user.id !== meId && (canAppointManagers || m.role === "SALES_REP") && (
              <>
                {m.isActive && (
                  <ConfirmButton
                    trigger={<Button size="iconSm" variant="ghost" aria-label={`Reset password for ${m.user.name}`}><KeyRound className="h-4 w-4" /></Button>}
                    title="Reset password?"
                    description="A new temporary password will be generated and all of their sessions signed out."
                    confirmLabel="Reset"
                    danger={false}
                    onConfirm={() => reset.run(m.id)}
                  />
                )}
                {m.isActive ? (
                  <ConfirmButton
                    trigger={<Button size="iconSm" variant="ghost" aria-label={`Remove ${m.user.name}`}><UserMinus className="h-4 w-4" /></Button>}
                    title={`Remove ${m.user.name}?`}
                    description="They lose access to this dealership immediately. Their open leads return to the team's unassigned queue (the dealership keeps them)."
                    confirmLabel="Remove access"
                    onConfirm={() => upd.run(m.id, { isActive: false })}
                  />
                ) : (
                  <Button size="xs" variant="secondary" onClick={() => upd.run(m.id, { isActive: true })}>Restore</Button>
                )}
              </>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-5 py-5 text-sm text-ink-400">No team members yet.</li>}
      </ul>
      <div className="border-t border-ink-100 px-5 py-3">
        <Dialog
          open={open}
          onOpenChange={setOpen}
          trigger={<Button size="sm" variant="secondary"><UserPlus className="h-4 w-4" /> Add team member</Button>}
          title="Add team member"
          description="Creates a dealer-portal account (or adds an existing dealer account) with access to this dealership only."
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.pending} onClick={() => add.run({ dealershipId, ...f, role: f.role as "MANAGER" })}>Add</Button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={add.fieldErrors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            <Field label="Email" required error={add.fieldErrors.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
            <Field label="Phone">{(p) => <Input {...p} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
            <Field label="Role">
              {(p) => (
                <Select {...p} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} disabled={!canAppointManagers}>
                  {canAppointManagers && <option value="MANAGER">Dealership manager</option>}
                  <option value="SALES_REP">Sales representative</option>
                </Select>
              )}
            </Field>
          </div>
        </Dialog>
      </div>
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)} title="Temporary password" description="Shown only once. Share it securely — the user must change it at first sign-in." size="sm">
        {secret && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">For {secret.email}:</p>
            <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-white">
              <span className="flex-1 select-all">{secret.pw}</span>
              <button aria-label="Copy password" onClick={() => { void navigator.clipboard.writeText(secret.pw); toast.success("Copied"); }}><Copy className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-ink-500">An access email has been queued; it is only delivered if SMTP is configured.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
