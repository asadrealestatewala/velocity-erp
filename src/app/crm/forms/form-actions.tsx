"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, MoreHorizontal, Pencil, Plus, Rocket, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import { createFormAction, duplicateFormAction, publishFormAction, unpublishFormAction } from "@/server/actions/forms";
import { slugify } from "@/lib/utils";

export function NewFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", slug: "", type: "CUSTOM", template: true });
  const { run, pending, fieldErrors } = useAction(createFormAction, { onSuccess: (d) => d && router.push(`/crm/forms/${d.id}`) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button><Plus className="h-4 w-4" /> New form</Button>}
      title="Create a form"
      description="Start from a template or a blank form. New forms are drafts until published."
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run({ ...f, type: f.type as "CUSTOM" })}>Create & open builder</Button></>}
    >
      <div className="space-y-4">
        <Field label="Form name" required error={fieldErrors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || "" })} />}</Field>
        <Field label="Public URL" help={`/forms/${f.slug || slugify(f.name) || "…"}`} error={fieldErrors.slug}>{(p) => <Input {...p} value={f.slug} placeholder={slugify(f.name)} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />}</Field>
        <Field label="Form type" help="The type decides how submissions are processed (lead, test-drive booking or dealership application).">
          {(p) => (
            <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="CUSTOM">Custom lead form</option>
              <option value="TEST_DRIVE">Test-drive booking</option>
              <option value="GENERAL_INQUIRY">General inquiry</option>
              <option value="DEALERSHIP_APPLICATION">Dealership application</option>
            </Select>
          )}
        </Field>
        {f.type !== "CUSTOM" && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.template} onChange={(e) => setF({ ...f, template: e.target.checked })} className="accent-brand-500" /> Start from the standard template fields</label>
        )}
      </div>
    </Dialog>
  );
}

export function FormRowActions({ id, slug, status }: { id: string; slug: string; status: string }) {
  const router = useRouter();
  const publish = useAction(publishFormAction);
  const unpublish = useAction(unpublishFormAction);
  const dup = useAction(duplicateFormAction, { onSuccess: (d) => d && router.push(`/crm/forms/${d.id}`) });
  return (
    <Menu trigger={<Button variant="ghost" size="iconSm" aria-label="Form actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
      <MenuItem onSelect={() => router.push(`/crm/forms/${id}`)}><Pencil className="h-4 w-4" /> Edit in builder</MenuItem>
      <MenuItem onSelect={() => window.open(`/forms/${slug}?preview=1`, "_blank")}><Eye className="h-4 w-4" /> Preview draft</MenuItem>
      <MenuItem onSelect={() => dup.run(id)}><Copy className="h-4 w-4" /> Duplicate</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => publish.run(id)}><Rocket className="h-4 w-4" /> {status === "PUBLISHED" ? "Publish latest draft" : "Publish"}</MenuItem>
      {status === "PUBLISHED" && <MenuItem danger onSelect={() => unpublish.run(id)}><Undo2 className="h-4 w-4" /> Unpublish</MenuItem>}
    </Menu>
  );
}
