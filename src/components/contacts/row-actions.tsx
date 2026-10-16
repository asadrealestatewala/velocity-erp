"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarClock, Eye, MoreHorizontal, Pencil, Share2 } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { AssignDialog, FollowUpDialog } from "@/components/leads/lead-dialogs";
import { Dialog } from "@/components/ui/dialog";
import { useAction } from "@/components/ui/use-action";
import { setArchivedAction } from "@/server/actions/contacts";

export function ContactRowActions({
  contactId,
  base,
  lead,
  can,
  archived,
}: {
  contactId: string;
  base: string;
  lead: { id: string; dealershipId: string | null; userId: string | null } | null;
  can: { edit: boolean; assign: "central" | "team" | null; followUp: boolean; archive: boolean };
  archived: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"assign" | "follow" | "archive" | null>(null);
  const archive = useAction(setArchivedAction, { onSuccess: () => setDialog(null) });
  return (
    <>
      <Menu trigger={<Button variant="ghost" size="iconSm" aria-label="Row actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
        <MenuItem onSelect={() => router.push(`${base}/contacts/${contactId}`)}><Eye className="h-4 w-4" /> View details</MenuItem>
        {can.edit && <MenuItem onSelect={() => router.push(`${base}/contacts/${contactId}/edit`)}><Pencil className="h-4 w-4" /> Edit</MenuItem>}
        {lead && can.assign && <MenuItem onSelect={() => setDialog("assign")}><Share2 className="h-4 w-4" /> Assign</MenuItem>}
        {lead && can.followUp && <MenuItem onSelect={() => setDialog("follow")}><CalendarClock className="h-4 w-4" /> Schedule follow-up</MenuItem>}
        {can.archive && (
          <>
            <MenuSeparator />
            <MenuItem danger={!archived} onSelect={() => setDialog("archive")}>
              {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {archived ? "Restore" : "Archive"}
            </MenuItem>
          </>
        )}
      </Menu>
      {lead && can.assign && (
        <AssignDialog leadId={lead.id} current={{ dealershipId: lead.dealershipId, userId: lead.userId }} mode={can.assign} open={dialog === "assign"} onOpenChange={(o) => setDialog(o ? "assign" : null)} />
      )}
      {lead && can.followUp && <FollowUpDialog leadId={lead.id} open={dialog === "follow"} onOpenChange={(o) => setDialog(o ? "follow" : null)} />}
      <Dialog
        open={dialog === "archive"}
        onOpenChange={(o) => setDialog(o ? "archive" : null)}
        title={archived ? "Restore contact?" : "Archive contact?"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant={archived ? "primary" : "danger"} loading={archive.pending} onClick={() => archive.run(contactId, !archived)}>
              {archived ? "Restore" : "Archive"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          {archived
            ? "The contact and its leads return to active lists."
            : "Archived contacts and their leads are hidden from active lists and reports. Nothing is deleted — you can restore it at any time."}
        </p>
      </Dialog>
    </>
  );
}
