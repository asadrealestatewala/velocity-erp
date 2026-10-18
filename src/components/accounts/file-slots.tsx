"use client";
import { Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { VOUCHER_DOC_KIND } from "@/lib/ops-constants";

export type FileSlot = { id: number; file: File | null; kind: keyof typeof VOUCHER_DOC_KIND };

let n = 0;
export const newSlot = (kind: FileSlot["kind"] = "RECEIPT"): FileSlot => ({ id: ++n, file: null, kind });

/** Writes the chosen files into the `file_N` / `kind_N` fields the upload helper reads. */
export function appendSlots(fd: FormData, slots: FileSlot[]) {
  let i = 0;
  for (const s of slots) {
    if (!s.file) continue;
    fd.set(`file_${i}`, s.file);
    fd.set(`kind_${i}`, s.kind);
    i++;
  }
  return i;
}

/** Uploads go through one request (12 MB total) — warn before sending something that can only fail. */
export function slotsTooLarge(slots: FileSlot[]) {
  const total = slots.reduce((s, x) => s + (x.file?.size ?? 0), 0);
  return total > 11 * 1024 * 1024 ? "These files are too large together (12 MB per submission). Attach fewer or smaller files, then add the rest afterwards." : null;
}

export function FileSlots({ slots, onChange, kinds, max = 8, error }: { slots: FileSlot[]; onChange: (s: FileSlot[]) => void; kinds?: (keyof typeof VOUCHER_DOC_KIND)[]; max?: number; error?: string }) {
  const options = (kinds ?? (Object.keys(VOUCHER_DOC_KIND) as (keyof typeof VOUCHER_DOC_KIND)[]));
  const set = (id: number, patch: Partial<FileSlot>) => onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {slots.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 p-2">
          <Paperclip className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <Select aria-label="Document type" className="h-9 w-44 py-1" value={s.kind} onChange={(e) => set(s.id, { kind: e.target.value as FileSlot["kind"] })}>
            {options.map((k) => <option key={k} value={k}>{VOUCHER_DOC_KIND[k]}</option>)}
          </Select>
          <input
            aria-label="Choose file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,image/png,image/jpeg,image/webp,application/pdf"
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5"
            onChange={(e) => set(s.id, { file: e.target.files?.[0] ?? null })}
          />
          {slots.length > 1 && (
            <Button size="iconSm" variant="ghost" aria-label="Remove file" onClick={() => onChange(slots.filter((x) => x.id !== s.id))}><X className="h-4 w-4" /></Button>
          )}
        </div>
      ))}
      {slots.length < max && <Button size="xs" variant="secondary" onClick={() => onChange([...slots, newSlot(options[0])])}><Plus className="h-3 w-3" /> Attach another document</Button>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <p className="text-xs text-ink-500">PDF, JPG, PNG, WEBP, DOCX or XLSX · up to 10 MB each.</p>
    </div>
  );
}
