"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Link2, MoreHorizontal, Share2, ShieldAlert, UserPlus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import { AssignDialog } from "@/components/leads/lead-dialogs";
import { checkDuplicatesAction } from "@/server/actions/contacts";
import {
  createContactFromSubmissionAction, createLeadFromSubmissionAction, linkSubmissionToContactAction, markSubmissionReviewedAction, setSubmissionSpamAction,
} from "@/server/actions/submissions";

export function SubmissionActions({
  id, status, isApplication, hasContact, hasLead, lead, canAssign,
}: {
  id: string; status: string; isApplication: boolean; hasContact: boolean; hasLead: boolean;
  lead: { id: string; dealershipId: string | null; userId: string | null } | null; canAssign: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"link" | "assign" | null>(null);
  const reviewed = useAction(markSubmissionReviewedAction);
  const spam = useAction(setSubmissionSpamAction);
  const create = useAction(createContactFromSubmissionAction, { onSuccess: (d) => d && router.push(`/crm/contacts/${d.contactId}`) });
  const mkLead = useAction(createLeadFromSubmissionAction);
  const link = useAction(linkSubmissionToContactAction, { onSuccess: () => setDialog(null) });
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string; phone: string | null; email: string | null }[]>([]);

  return (
    <div className="flex flex-wrap gap-2">
      {status === "NEW" && <Button variant="secondary" loading={reviewed.pending} onClick={() => reviewed.run(id)}><CheckCheck className="h-4 w-4" /> Mark reviewed</Button>}
      {lead && canAssign && <Button variant="secondary" onClick={() => setDialog("assign")}><Share2 className="h-4 w-4" /> Assign lead</Button>}
      {!isApplication && (
        <Menu trigger={<Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
          {!hasContact && <MenuItem onSelect={() => setDialog("link")}><Link2 className="h-4 w-4" /> Link to existing contact</MenuItem>}
          {!hasContact && <MenuItem onSelect={() => create.run(id)}><UserPlus className="h-4 w-4" /> Create new contact</MenuItem>}
          {hasContact && !hasLead && <MenuItem onSelect={() => mkLead.run(id)}><Workflow className="h-4 w-4" /> Create lead</MenuItem>}
          {status !== "SPAM" ? (
            <MenuItem danger onSelect={() => spam.run(id, true)}><ShieldAlert className="h-4 w-4" /> Mark as spam</MenuItem>
          ) : (
            <MenuItem onSelect={() => spam.run(id, false)}><ShieldAlert className="h-4 w-4" /> Not spam</MenuItem>
          )}
        </Menu>
      )}
      {lead && canAssign && <AssignDialog leadId={lead.id} current={{ dealershipId: lead.dealershipId, userId: lead.userId }} mode="central" open={dialog === "assign"} onOpenChange={(o) => setDialog(o ? "assign" : null)} />}
      <Dialog open={dialog === "link"} onOpenChange={(o) => setDialog(o ? "link" : null)} title="Link to an existing contact" description="Search by phone or email (normalised matching).">
        <div className="space-y-3">
          <Field label="Phone or email">
            {(p) => (
              <Input
                {...p}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const r = await checkDuplicatesAction(q.includes("@") ? { email: q } : { phone: q });
                  setMatches(r.ok && r.data ? r.data.matches : []);
                }}
                placeholder="Press Enter to search"
              />
            )}
          </Field>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-ink-400">No matches yet.</li>}
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1"><p className="font-medium">{m.name}</p><p className="text-xs text-ink-500">{[m.phone, m.email].filter(Boolean).join(" · ")}</p></div>
                <Button size="sm" loading={link.pending} onClick={() => link.run(id, m.id)}>Link</Button>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </div>
  );
}
