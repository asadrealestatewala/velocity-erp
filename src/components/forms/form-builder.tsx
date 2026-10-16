"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Eye, GripVertical, ImageUp, Plus, Rocket, Save, Settings2, Trash2, Undo2, X, Copy, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { duplicateFormAction, publishFormAction, saveFormDraftAction, unpublishFormAction, uploadFormHeaderAction } from "@/server/actions/forms";
import { CRM_MAPPINGS, FIELD_TYPE_LABELS, FIELD_TYPES, OPTION_SOURCES, newFieldId, type FieldType, type FormField, type FormSettings } from "@/lib/forms/schema";

const SOURCE_LABEL = { cities: "Cities (active)", outlets: "Outlets in selected city", bikeModels: "Bike models (active)", provinces: "Provinces" } as const;

export function FormBuilder({
  form,
  sources,
}: {
  form: { id: string; slug: string; name: string; description: string | null; type: string; status: string; fields: FormField[]; settings: FormSettings; dirtySincePublish: boolean };
  sources: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [selected, setSelected] = useState<string | null>(form.fields[0]?.id ?? null);
  const [panel, setPanel] = useState<"field" | "settings">("field");
  const [dirty, setDirty] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const save = useAction(saveFormDraftAction, { onSuccess: () => setDirty(false) });
  const publish = useAction(publishFormAction);
  const unpublish = useAction(unpublishFormAction);
  const dup = useAction(duplicateFormAction, { onSuccess: (d) => d && router.push(`/crm/forms/${d.id}`) });
  const upload = useAction(uploadFormHeaderAction, { refresh: false, onSuccess: (d) => d && updateSettings({ headerImageUrl: d.url }) });
  const headerInput = useRef<HTMLInputElement>(null);

  const sel = fields.find((f) => f.id === selected) ?? null;
  const mutate = (fn: (f: FormField[]) => FormField[]) => { setFields(fn); setDirty(true); };
  const updateField = (id: string, patch: Partial<FormField>) => mutate((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const updateSettings = (patch: Partial<FormSettings>) => { setSettings((s) => ({ ...s, ...patch })); setDirty(true); };
  const move = (from: number, to: number) => mutate((fs) => { if (to < 0 || to >= fs.length) return fs; const c = [...fs]; const [x] = c.splice(from, 1); c.splice(to, 0, x!); return c; });
  const addField = (type: FieldType) => {
    const base = type === "heading" ? "section" : type;
    let key = base;
    for (let i = 2; fields.some((f) => f.key === key); i++) key = `${base}_${i}`;
    const f: FormField = {
      id: newFieldId(), key, type, label: FIELD_TYPE_LABELS[type], required: false, width: type === "textarea" || type === "consent" || type === "heading" || type === "file" ? "full" : "half",
      ...(type === "select" || type === "radio" || type === "checkboxes" ? { options: [{ label: "Option 1", value: "option_1" }] } : {}),
      ...(type === "file" ? { accept: "document" as const, maxFiles: 3 } : {}),
      ...(type === "consent" ? { required: true, mapTo: fields.some((x) => x.mapTo === "consent") ? null : ("consent" as const) } : {}),
    };
    mutate((fs) => [...fs, f]);
    setSelected(f.id);
    setPanel("field");
  };

  const saveDraft = () => save.run(form.id, { name, description, fields, settings });
  const publishNow = async () => {
    if (dirty) {
      const r = await saveFormDraftAction(form.id, { name, description, fields, settings });
      if (!r.ok) return toast.error(r.error);
      setDirty(false);
    }
    publish.run(form.id);
  };

  const keyErrors = useMemo(() => {
    const seen = new Map<string, number>();
    fields.forEach((f) => seen.set(f.key, (seen.get(f.key) ?? 0) + 1));
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [fields]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card sticky top-16 z-20 flex flex-wrap items-center gap-2 p-3">
        <Input aria-label="Form name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-9 max-w-xs font-semibold" />
        <Badge tone={form.status === "PUBLISHED" ? "green" : form.status === "UNPUBLISHED" ? "amber" : "gray"}>{form.status.toLowerCase()}</Badge>
        {(dirty || form.dirtySincePublish) && form.status === "PUBLISHED" && <Badge tone="amber">Unpublished changes</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.open(`/forms/${form.slug}?preview=1`, "_blank")} title={dirty ? "Save first to preview your latest changes" : undefined}><Eye className="h-4 w-4" /> Preview</Button>
          <Button variant="secondary" size="sm" loading={dup.pending} onClick={() => dup.run(form.id)}><Copy className="h-4 w-4" /> Duplicate</Button>
          {form.status === "PUBLISHED" && <Button variant="secondary" size="sm" loading={unpublish.pending} onClick={() => unpublish.run(form.id)}><Undo2 className="h-4 w-4" /> Unpublish</Button>}
          <Button variant="dark" size="sm" loading={save.pending} disabled={!dirty} onClick={saveDraft}><Save className="h-4 w-4" /> Save draft</Button>
          <Button size="sm" loading={publish.pending} onClick={publishNow}><Rocket className="h-4 w-4" /> Publish</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Canvas */}
        <div className="min-w-0">
          <p className="mb-2 text-center text-xs text-ink-400">Click any field to edit it. Drag a field (or use ↑ ↓) to reorder.</p>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-[#eef1f5]">
            <div className="relative h-28 bg-ink-950 bg-cover bg-center" style={settings.headerImageUrl ? { backgroundImage: `url(${settings.headerImageUrl})` } : undefined}>
              <div className={cn("absolute inset-0", settings.headerImageUrl ? "bg-ink-950/60" : "bg-[radial-gradient(ellipse_at_15%_10%,rgba(240,116,0,0.45),transparent_55%),linear-gradient(135deg,#0a0c0f,#1f2530)]")} />
              <div className="relative flex h-full flex-col items-center justify-center text-center text-white">
                <p className="text-xl font-bold">{settings.title}</p>
                {settings.subtitle && <p className="max-w-md px-4 text-xs text-white/75">{settings.subtitle}</p>}
              </div>
            </div>
            <div className="mx-3 -mt-4 mb-4 rounded-2xl bg-white p-4 shadow sm:mx-6">
              {settings.cardTitle && <p className="mb-3 text-center text-sm font-bold tracking-wide uppercase">{settings.cardTitle}</p>}
              <div className="grid grid-cols-6 gap-2">
                {fields.map((f, i) => (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={() => (dragIndex.current = i)}
                    onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
                    onDragLeave={() => setOverIndex(null)}
                    onDrop={(e) => { e.preventDefault(); if (dragIndex.current !== null) move(dragIndex.current, i); dragIndex.current = null; setOverIndex(null); }}
                    onClick={() => { setSelected(f.id); setPanel("field"); }}
                    className={cn(
                      "group relative col-span-6 cursor-pointer rounded-xl border bg-white p-3 transition",
                      f.width === "half" && "sm:col-span-3", f.width === "third" && "sm:col-span-2",
                      selected === f.id ? "border-brand-500 ring-4 ring-brand-500/15" : "border-ink-200 hover:border-ink-300",
                      overIndex === i && "border-dashed border-brand-400 bg-brand-50/40",
                      keyErrors.has(f.key) && "border-red-400",
                    )}
                  >
                    <div className={cn("absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md bg-ink-900 px-1 py-0.5 text-white shadow transition", selected === f.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      <span className="flex cursor-grab items-center gap-1 px-1 text-[10px]"><GripVertical className="h-3 w-3" /> Drag</span>
                      <button type="button" aria-label="Move up" onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} className="rounded p-0.5 hover:bg-white/15"><ArrowUp className="h-3 w-3" /></button>
                      <button type="button" aria-label="Move down" onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} className="rounded p-0.5 hover:bg-white/15"><ArrowDown className="h-3 w-3" /></button>
                      <button type="button" aria-label="Delete field" onClick={(e) => { e.stopPropagation(); mutate((fs) => fs.filter((x) => x.id !== f.id)); if (selected === f.id) setSelected(null); }} className="rounded p-0.5 hover:bg-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <FieldPreview f={f} />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.mapTo && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">→ {CRM_MAPPINGS[f.mapTo].split(" · ")[1]}</span>}
                      {f.conditional?.field && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">conditional</span>}
                      {f.optionsSource && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">live: {f.optionsSource}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-center">
                <span className="inline-flex h-10 w-full max-w-xs items-center justify-center rounded-xl text-sm font-bold tracking-wide text-white uppercase" style={{ background: settings.primaryColor }}>{settings.submitLabel}</span>
              </div>
            </div>
          </div>
          <div className="card mt-3 p-3">
            <p className="mb-2 text-xs font-semibold text-ink-500 uppercase">Add a field</p>
            <div className="flex flex-wrap gap-1.5">
              {FIELD_TYPES.map((t) => (
                <Button key={t} size="xs" variant="secondary" onClick={() => addField(t)}><Plus className="h-3 w-3" /> {FIELD_TYPE_LABELS[t]}</Button>
              ))}
            </div>
          </div>
        </div>

        {/* Inspector */}
        <aside className="card self-start xl:sticky xl:top-36">
          <div className="flex border-b border-ink-100" role="tablist">
            <button role="tab" aria-selected={panel === "field"} onClick={() => setPanel("field")} className={cn("flex-1 border-b-2 px-3 py-3 text-sm font-medium", panel === "field" ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500")}>Field</button>
            <button role="tab" aria-selected={panel === "settings"} onClick={() => setPanel("settings")} className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium", panel === "settings" ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500")}><Settings2 className="h-4 w-4" /> Form settings</button>
          </div>
          <div className="max-h-[calc(100dvh-14rem)] space-y-4 overflow-y-auto p-4">
            {panel === "field" ? (
              sel ? (
                <FieldInspector f={sel} fields={fields} onChange={(p) => updateField(sel.id, p)} duplicateKey={keyErrors.has(sel.key)} />
              ) : (
                <p className="py-10 text-center text-sm text-ink-400">Select a field to edit, or add one.</p>
              )
            ) : (
              <>
                <Field label="Header title">{(p) => <Input {...p} value={settings.title} onChange={(e) => updateSettings({ title: e.target.value })} />}</Field>
                <Field label="Header subtitle">{(p) => <Input {...p} value={settings.subtitle ?? ""} onChange={(e) => updateSettings({ subtitle: e.target.value })} />}</Field>
                <Field label="Card title">{(p) => <Input {...p} value={settings.cardTitle ?? ""} onChange={(e) => updateSettings({ cardTitle: e.target.value })} />}</Field>
                <div>
                  <p className="label">Header photo</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" loading={upload.pending} onClick={() => headerInput.current?.click()}><ImageUp className="h-4 w-4" /> Upload</Button>
                    {settings.headerImageUrl && <Button size="sm" variant="ghost" onClick={() => updateSettings({ headerImageUrl: "" })}><X className="h-4 w-4" /> Remove</Button>}
                  </div>
                  <input ref={headerInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const fd = new FormData(); fd.set("file", file); upload.run(form.id, fd); } e.target.value = ""; }} />
                  <p className="mt-1 text-xs text-ink-500">Without a photo, a branded dark gradient is used.</p>
                </div>
                <Field label="Brand colour">{(p) => <div className="flex gap-2"><input type="color" aria-label="Brand colour picker" value={settings.primaryColor} onChange={(e) => updateSettings({ primaryColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-ink-200" /><Input {...p} value={settings.primaryColor} onChange={(e) => updateSettings({ primaryColor: e.target.value })} /></div>}</Field>
                <Field label="Submit button label">{(p) => <Input {...p} value={settings.submitLabel} onChange={(e) => updateSettings({ submitLabel: e.target.value })} />}</Field>
                <Field label="Success title">{(p) => <Input {...p} value={settings.successTitle} onChange={(e) => updateSettings({ successTitle: e.target.value })} />}</Field>
                <Field label="Success message">{(p) => <Textarea {...p} rows={3} value={settings.successMessage} onChange={(e) => updateSettings({ successMessage: e.target.value })} />}</Field>
                {form.type !== "DEALERSHIP_APPLICATION" && (
                  <>
                    <Field label="Lead routing" help="How leads from this form are assigned.">
                      {(p) => (
                        <Select {...p} value={settings.routing} onChange={(e) => updateSettings({ routing: e.target.value as FormSettings["routing"] })}>
                          <option value="SELECTED_OUTLET">Assign to the outlet the customer selects</option>
                          <option value="CITY_AUTO">Auto-assign by city (least-loaded eligible outlet)</option>
                          <option value="MANUAL">Manual — leave in the central unassigned queue</option>
                        </Select>
                      )}
                    </Field>
                    {settings.routing === "SELECTED_OUTLET" && (
                      <Checkbox label="If no outlet is selected, fall back to city routing" checked={!!settings.allowCityFallback} onChange={(e) => updateSettings({ allowCityFallback: e.target.checked })} />
                    )}
                    <Field label="Lead source" help="UTM sources (facebook, instagram, tiktok…) override this automatically.">
                      {(p) => <Select {...p} value={settings.sourceKey} onChange={(e) => updateSettings({ sourceKey: e.target.value })}>{sources.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select>}
                    </Field>
                  </>
                )}
                <Field label="Privacy policy URL" help="Leave blank to use the system default (Settings).">{(p) => <Input {...p} value={settings.privacyPolicyUrl ?? ""} onChange={(e) => updateSettings({ privacyPolicyUrl: e.target.value })} />}</Field>
                <Field label="Consent wording" help='Leave blank for the system default. "Privacy Policy" becomes a link.'>{(p) => <Textarea {...p} rows={3} value={settings.consentText ?? ""} onChange={(e) => updateSettings({ consentText: e.target.value })} />}</Field>
                <Field label="Internal description">{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />}</Field>
              </>
            )}
          </div>
          {dirty && <p className="flex items-center gap-1.5 border-t border-ink-100 px-4 py-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Unsaved changes</p>}
        </aside>
      </div>
    </div>
  );
}

function FieldPreview({ f }: { f: FormField }) {
  if (f.type === "heading") return <p className="text-sm font-bold uppercase">{f.label}</p>;
  if (f.type === "consent" || f.type === "checkbox")
    return <label className="flex items-center gap-2 text-sm text-ink-600"><input type="checkbox" disabled /> {f.type === "consent" ? "Privacy consent checkbox" : f.label}{f.required && <span className="text-brand-600">*</span>}</label>;
  return (
    <div className="pointer-events-none">
      <p className="mb-1 text-xs font-medium text-ink-700">{f.label}{f.required && <span className="text-brand-600"> *</span>}</p>
      {f.type === "select" ? (
        <div className="flex h-8 items-center justify-between rounded-md border border-ink-200 bg-ink-50 px-2 text-xs text-ink-400">{f.placeholder || "Select…"}<span>▾</span></div>
      ) : f.type === "radio" || f.type === "checkboxes" ? (
        <div className="flex flex-wrap gap-1">{(f.options ?? []).slice(0, 4).map((o) => <span key={o.value} className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-500">{o.label}</span>)}</div>
      ) : f.type === "textarea" ? (
        <div className="h-12 rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-xs text-ink-400">{f.placeholder}</div>
      ) : f.type === "file" ? (
        <div className="rounded-md border-2 border-dashed border-ink-200 px-2 py-2 text-xs text-ink-400">Upload area</div>
      ) : (
        <div className="flex h-8 items-center rounded-md border border-ink-200 bg-ink-50 px-2 text-xs text-ink-400">{f.placeholder || FIELD_TYPE_LABELS[f.type]}</div>
      )}
      {f.helpText && <p className="mt-1 text-[11px] text-ink-400">{f.helpText}</p>}
    </div>
  );
}

function FieldInspector({ f, fields, onChange, duplicateKey }: { f: FormField; fields: FormField[]; onChange: (p: Partial<FormField>) => void; duplicateKey: boolean }) {
  const hasOptions = f.type === "select" || f.type === "radio" || f.type === "checkboxes";
  const others = fields.filter((x) => x.id !== f.id && x.type !== "heading" && x.type !== "file");
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}</Select>}</Field>
        <Field label="Width">{(p) => <Select {...p} value={f.width} onChange={(e) => onChange({ width: e.target.value as FormField["width"] })}><option value="full">Full</option><option value="half">Half</option><option value="third">Third</option></Select>}</Field>
      </div>
      <Field label="Label">{(p) => <Input {...p} value={f.label} onChange={(e) => onChange({ label: e.target.value })} />}</Field>
      <Field label="Field key" help="Stored with each submission. Lowercase, numbers, underscores." error={duplicateKey ? "Another field uses this key" : undefined}>
        {(p) => <Input {...p} value={f.key} onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) })} />}
      </Field>
      {f.type !== "heading" && f.type !== "consent" && (
        <>
          <Field label="Placeholder">{(p) => <Input {...p} value={f.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value })} />}</Field>
          <Field label="Help text">{(p) => <Input {...p} value={f.helpText ?? ""} onChange={(e) => onChange({ helpText: e.target.value })} />}</Field>
        </>
      )}
      {f.type !== "heading" && <Checkbox label="Required" checked={f.required} onChange={(e) => onChange({ required: e.target.checked })} />}

      {f.type === "select" && (
        <Field label="Options come from" help="Live sources are read from the database when the form loads.">
          {(p) => (
            <Select {...p} value={f.optionsSource ?? ""} onChange={(e) => onChange({ optionsSource: (e.target.value || null) as FormField["optionsSource"] })}>
              <option value="">Static options (below)</option>
              {OPTION_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
      )}
      {(f.optionsSource === "outlets" || f.optionsSource === "cities") && (
        <Field label={f.optionsSource === "outlets" ? "City field (required)" : "Filter by province field (optional)"}>
          {(p) => (
            <Select {...p} value={f.dependsOn ?? ""} onChange={(e) => onChange({ dependsOn: e.target.value || undefined })}>
              <option value="">—</option>
              {fields.filter((x) => x.optionsSource === (f.optionsSource === "outlets" ? "cities" : "provinces")).map((x) => <option key={x.id} value={x.key}>{x.label}</option>)}
            </Select>
          )}
        </Field>
      )}
      {hasOptions && !f.optionsSource && (
        <div>
          <p className="label">Options</p>
          <div className="space-y-1.5">
            {(f.options ?? []).map((o, i) => (
              <div key={i} className="flex gap-1.5">
                <Input aria-label={`Option ${i + 1} label`} value={o.label} onChange={(e) => onChange({ options: f.options!.map((x, j) => (j === i ? { label: e.target.value, value: x.value.startsWith("option_") ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60) || x.value : x.value } : x)) })} />
                <Input aria-label={`Option ${i + 1} value`} value={o.value} className="w-28 font-mono text-xs" onChange={(e) => onChange({ options: f.options!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <Button size="icon" variant="ghost" aria-label="Remove option" onClick={() => onChange({ options: f.options!.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="xs" variant="secondary" onClick={() => onChange({ options: [...(f.options ?? []), { label: `Option ${(f.options?.length ?? 0) + 1}`, value: `option_${(f.options?.length ?? 0) + 1}` }] })}><Plus className="h-3 w-3" /> Add option</Button>
          </div>
        </div>
      )}

      {f.type !== "heading" && (
        <Field label="Maps to CRM field" help="Mapped fields create/match the contact and lead.">
          {(p) => (
            <Select {...p} value={f.mapTo ?? ""} onChange={(e) => onChange({ mapTo: (e.target.value || null) as FormField["mapTo"] })}>
              <option value="">Not mapped (kept in submission data)</option>
              {Object.entries(CRM_MAPPINGS).map(([k, l]) => <option key={k} value={k} disabled={fields.some((x) => x.id !== f.id && x.mapTo === k)}>{l}</option>)}
            </Select>
          )}
        </Field>
      )}

      {(f.type === "text" || f.type === "textarea" || f.type === "number" || f.type === "phone") && (
        <div className="grid grid-cols-2 gap-3">
          {f.type === "number" ? (
            <>
              <Field label="Min">{(p) => <Input {...p} type="number" value={f.validation?.min ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, min: e.target.value === "" ? undefined : Number(e.target.value) } })} />}</Field>
              <Field label="Max">{(p) => <Input {...p} type="number" value={f.validation?.max ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, max: e.target.value === "" ? undefined : Number(e.target.value) } })} />}</Field>
            </>
          ) : (
            <>
              <Field label="Min length">{(p) => <Input {...p} type="number" min={0} value={f.validation?.minLength ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, minLength: e.target.value === "" ? undefined : Number(e.target.value) } })} />}</Field>
              <Field label="Max length">{(p) => <Input {...p} type="number" min={1} value={f.validation?.maxLength ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, maxLength: e.target.value === "" ? undefined : Number(e.target.value) } })} />}</Field>
            </>
          )}
          {f.type === "text" && (
            <>
              <Field label="Pattern (regex)" className="col-span-2">{(p) => <Input {...p} className="font-mono text-xs" value={f.validation?.pattern ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, pattern: e.target.value || undefined } })} />}</Field>
              <Field label="Pattern error message" className="col-span-2">{(p) => <Input {...p} value={f.validation?.patternMessage ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, patternMessage: e.target.value || undefined } })} />}</Field>
            </>
          )}
        </div>
      )}

      {f.type === "file" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Accept">{(p) => <Select {...p} value={f.accept ?? "document"} onChange={(e) => onChange({ accept: e.target.value as "image" })}><option value="document">Documents & images</option><option value="image">Images only</option></Select>}</Field>
          <Field label="Max files">{(p) => <Input {...p} type="number" min={1} max={10} value={f.maxFiles ?? 1} onChange={(e) => onChange({ maxFiles: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />}</Field>
        </div>
      )}

      {f.type !== "heading" && (
        <div className="rounded-xl border border-ink-200 p-3">
          <p className="label">Conditional visibility</p>
          <div className="space-y-2">
            <Select aria-label="Show only when field" value={f.conditional?.field ?? ""} onChange={(e) => onChange({ conditional: e.target.value ? { field: e.target.value, op: f.conditional?.op ?? "equals", value: f.conditional?.value ?? "" } : null })}>
              <option value="">Always show</option>
              {others.map((x) => <option key={x.id} value={x.key}>Show when “{x.label}”…</option>)}
            </Select>
            {f.conditional?.field && (
              <div className="flex gap-2">
                <Select aria-label="Condition" value={f.conditional.op} onChange={(e) => onChange({ conditional: { ...f.conditional!, op: e.target.value as "equals" } })} className="w-36">
                  <option value="equals">equals</option><option value="notEquals">is not</option><option value="notEmpty">is filled</option><option value="empty">is empty</option>
                </Select>
                {(f.conditional.op === "equals" || f.conditional.op === "notEquals") && (
                  <Input aria-label="Condition value" value={f.conditional.value ?? ""} onChange={(e) => onChange({ conditional: { ...f.conditional!, value: e.target.value } })} placeholder="value" />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
