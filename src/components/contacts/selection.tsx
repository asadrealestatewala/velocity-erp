"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { bulkAssignAction } from "@/server/actions/leads";
import { eligibleDealershipsAction } from "@/server/actions/lookups";

type Ctx = { selected: Map<string, string | null>; toggle: (contactId: string, leadId: string | null) => void; setAll: (rows: { contactId: string; leadId: string | null }[], on: boolean) => void; clear: () => void };
const SelectionCtx = createContext<Ctx | null>(null);
const useSelection = () => useContext(SelectionCtx);

/** Row selection shared by the checkboxes and the bulk bar. Selection resets when the list (page / filters) changes. */
export function SelectionProvider({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const [selected, setSelected] = useState<Map<string, string | null>>(new Map());
  useEffect(() => setSelected(new Map()), [resetKey]);
  const value = useMemo<Ctx>(
    () => ({
      selected,
      toggle: (id, leadId) =>
        setSelected((m) => {
          const n = new Map(m);
          if (n.has(id)) n.delete(id);
          else n.set(id, leadId);
          return n;
        }),
      setAll: (rows, on) => setSelected(on ? new Map(rows.map((r) => [r.contactId, r.leadId])) : new Map()),
      clear: () => setSelected(new Map()),
    }),
    [selected],
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

const box = "h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600";

export function SelectRow({ contactId, leadId, name }: { contactId: string; leadId: string | null; name: string }) {
  const s = useSelection();
  if (!s) return null;
  return <input type="checkbox" className={box} checked={s.selected.has(contactId)} onChange={() => s.toggle(contactId, leadId)} aria-label={`Select ${name}`} />;
}

export function SelectAll({ rows }: { rows: { contactId: string; leadId: string | null }[] }) {
  const s = useSelection();
  if (!s) return null;
  const all = rows.length > 0 && rows.every((r) => s.selected.has(r.contactId));
  const some = rows.some((r) => s.selected.has(r.contactId));
  return (
    <input
      type="checkbox"
      className={box}
      checked={all}
      ref={(el) => { if (el) el.indeterminate = some && !all; }}
      onChange={() => s.setAll(rows, !all)}
      aria-label="Select all contacts on this page"
    />
  );
}

/** Appears when rows are selected. Only actions backed by existing, permission-checked server actions are offered. */
export function BulkBar({ canAssign }: { canAssign: boolean }) {
  const s = useSelection();
  const [open, setOpen] = useState(false);
  const [dealers, setDealers] = useState<{ id: string; name: string; city?: { name: string } }[]>([]);
  const [dealershipId, setDealershipId] = useState("");
  const { run, pending } = useAction(bulkAssignAction, { onSuccess: () => { setOpen(false); s?.clear(); } });
  useEffect(() => {
    if (open) eligibleDealershipsAction().then((r) => r.ok && setDealers(r.data ?? []));
  }, [open]);
  if (!s || s.selected.size === 0) return null;
  const leadIds = [...s.selected.values()].filter((v): v is string => !!v);
  return (
    <>
      <div role="region" aria-label="Bulk actions" className="sticky top-[80px] z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 shadow-[var(--shadow-card)] reveal">
        <p className="text-sm font-semibold text-brand-800">{s.selected.size} selected</p>
        {canAssign && (
          <Button size="sm" variant="blue" onClick={() => setOpen(true)} disabled={leadIds.length === 0} title={leadIds.length === 0 ? "None of the selected contacts has a lead to assign" : undefined}>
            <Share2 className="h-4 w-4" /> Assign to dealership
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={s.clear} className="ml-auto"><X className="h-4 w-4" /> Clear selection</Button>
      </div>
      {open && (
        <Dialog
          open
          onOpenChange={setOpen}
          title={`Assign ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`}
          description={leadIds.length < s.selected.size ? `${s.selected.size - leadIds.length} selected contact(s) have no lead and will be skipped.` : "Only active dealerships accepting leads are listed. History is preserved."}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={pending} disabled={!dealershipId} onClick={() => run({ leadIds, dealershipId, reason: "Bulk assignment from contacts" })}>Assign</Button>
            </>
          }
        >
          <label htmlFor="bulk-dealer" className="label">Dealership</label>
          <Select id="bulk-dealer" value={dealershipId} onChange={(e) => setDealershipId(e.target.value)}>
            <option value="">Choose a dealership…</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.city ? ` · ${d.city.name}` : ""}</option>
            ))}
          </Select>
        </Dialog>
      )}
    </>
  );
}
