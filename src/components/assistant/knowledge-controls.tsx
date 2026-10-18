"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { deleteKnowledgeAction, saveKnowledgeAction } from "@/server/actions/knowledge";

type Draft = { title: string; body: string; tags: string; isActive: boolean };

export function KnowledgeDialog({ id, initial }: { id?: string; initial?: { title: string; body: string; tags: string[]; isActive: boolean } }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Draft>(initial ? { ...initial, tags: initial.tags.join(", ") } : { title: "", body: "", tags: "", isActive: true });
  const { run, pending, fieldErrors } = useAction(saveKnowledgeAction, { onSuccess: () => { setOpen(false); if (!id) setV({ title: "", body: "", tags: "", isActive: true }); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={id ? "Edit knowledge entry" : "New knowledge entry"}
      description="Write clear, factual reference text. The assistant uses active entries alongside the built-in guide when answering."
      trigger={id ? <Button size="iconSm" variant="ghost" aria-label={`Edit ${initial?.title}`}><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="h-4 w-4" /> New entry</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(id ?? null, { title: v.title, body: v.body, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), isActive: v.isActive })}>Save</Button></>}
    >
      <div className="grid gap-4">
        <Field label="Title" required error={fieldErrors.title}>{(p) => <Input {...p} placeholder="e.g. Warranty policy for batteries" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Content" required error={fieldErrors.body} help="Plain text. Include the facts people will ask about — dates, amounts, steps, who to contact.">{(p) => <Textarea {...p} rows={9} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />}</Field>
        <Field label="Tags" help="Comma-separated keywords that help the assistant find it">{(p) => <Input {...p} placeholder="warranty, battery, claims" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} />}</Field>
        <Checkbox label="Active (inactive entries are ignored by the assistant)" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} />
      </div>
    </Dialog>
  );
}

export function DeleteKnowledgeButton({ id, title }: { id: string; title: string }) {
  const { run } = useAction(deleteKnowledgeAction);
  return (
    <ConfirmButton
      trigger={<Button size="iconSm" variant="ghost" aria-label={`Delete ${title}`}><Trash2 className="h-4 w-4" /></Button>}
      title="Delete this entry?"
      description={`“${title}” will no longer be available to the assistant. This is recorded in the audit log.`}
      confirmLabel="Delete"
      onConfirm={async () => { await run(id); }}
    />
  );
}
