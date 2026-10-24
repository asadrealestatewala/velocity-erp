"use client";
import { useState } from "react";
import { Copy, MailPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { inviteUserAction, revokeInvitationAction } from "@/server/actions/invitations";

type Opt = { id: string; name: string };

/** "Invite by email": the person picks their own password from a one-time link (valid 7 days). */
export function InviteDialog({ roles, canInvite, blockedReason }: { roles: Opt[]; canInvite: boolean; blockedReason?: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [v, setV] = useState({ email: "", name: "", roleId: roles[0]?.id ?? "" });
  const invite = useAction(inviteUserAction, {
    onSuccess: (d) => {
      setOpen(false);
      setV({ email: "", name: "", roleId: roles[0]?.id ?? "" });
      if (d?.link) setLink(d.link);
    },
  });
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        trigger={<Button variant="secondary" disabled={!canInvite} title={blockedReason}><MailPlus className="h-4 w-4" /> Invite by email</Button>}
        title="Invite a colleague"
        description="They receive a one-time link (valid 7 days) and choose their own password."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={invite.pending} onClick={() => invite.run(v)}>Send invitation</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required error={invite.fieldErrors.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="colleague@company.com" />}</Field>
          <Field label="Name (optional)">{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Role" className="sm:col-span-2">{(p) => <Select {...p} value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
        </div>
      </Dialog>
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title="Share this invitation link" description="Email isn't set up on this server, so nothing was sent. Copy the link and send it yourself." size="sm">
        <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs break-all text-white">
          <span className="flex-1 select-all">{link}</span>
          <button aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(link ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" /></button>
        </div>
      </Dialog>
    </>
  );
}

export function RevokeInviteButton({ id, email }: { id: string; email: string }) {
  const revoke = useAction(revokeInvitationAction);
  return (
    <Button size="iconSm" variant="ghost" aria-label={`Revoke invitation for ${email}`} loading={revoke.pending} onClick={() => revoke.run(id)}>
      <X className="h-4 w-4" />
    </Button>
  );
}
