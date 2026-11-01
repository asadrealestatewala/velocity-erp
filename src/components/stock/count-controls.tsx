"use client";
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { cancelStockCountAction, completeStockCountAction, saveStockCountAction, startStockCountAction } from "@/server/actions/stock-counts";
import { useRouter } from "next/navigation";

export function StartCountDialog({ dealershipId }: { dealershipId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { run, pending, fieldErrors } = useAction(startStockCountAction, { onSuccess: (d) => { setOpen(false); if (d && typeof d === "object" && "id" in d) router.push(`/portal/stock-counts/${(d as { id: string }).id}`); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Start a stock count"
      description="Takes a snapshot of what the system expects. Count the shelves, enter what you find, then close the count to correct any differences."
      trigger={<Button><ClipboardCheck className="h-4 w-4" /> Start count</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(dealershipId, { title })}>Start count</Button></>}
    >
      <Field label="Title" help="Optional, e.g. “November month-end”" error={fieldErrors.title}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
    </Dialog>
  );
}

export type CountLineView = { id: string; name: string; code: string; expected: number; counted: number | null; note: string | null };

export function CountSheet({ dealershipId, countId, lines }: { dealershipId: string; countId: string; lines: CountLineView[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.counted === null ? "" : String(l.counted)])));
  const save = useAction(saveStockCountAction);
  const complete = useAction(completeStockCountAction, { onSuccess: () => router.push("/portal/stock-counts") });
  const cancel = useAction(cancelStockCountAction, { onSuccess: () => router.push("/portal/stock-counts") });
  const entries = () => lines.map((l) => ({ lineId: l.id, counted: vals[l.id] === "" ? null : Number(vals[l.id]) }));
  const counted = lines.filter((l) => vals[l.id] !== "").length;
  const diffs = lines.filter((l) => vals[l.id] !== "" && Number(vals[l.id]) !== l.expected).length;
  const invalid = lines.some((l) => vals[l.id] !== "" && (!Number.isInteger(Number(vals[l.id])) || Number(vals[l.id]) < 0));
  return (
    <div className="space-y-4">
      <div className="table-wrap overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Expected</th><th className="th text-right">Counted</th><th className="th text-right">Difference</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {lines.map((l) => {
              const raw = vals[l.id];
              const diff = raw === "" ? null : Number(raw) - l.expected;
              return (
                <tr key={l.id}>
                  <td className="td font-medium text-ink-900">{l.name}</td>
                  <td className="td font-mono text-xs">{l.code}</td>
                  <td className="td text-right tabular-nums">{l.expected}</td>
                  <td className="td text-right"><Input aria-label={`Counted ${l.name}`} className="ml-auto w-24 text-right" type="number" min={0} inputMode="numeric" value={raw} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value })} /></td>
                  <td className={`td text-right tabular-nums font-semibold ${diff ? (diff < 0 ? "text-red-600" : "text-green-700") : "text-ink-400"}`}>{diff === null ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">{counted} of {lines.length} counted · {diffs} difference{diffs === 1 ? "" : "s"}. Items you leave blank are not changed.</p>
        <div className="flex gap-2">
          <Button variant="secondary" loading={cancel.pending} onClick={() => confirm("Cancel this count? No stock will change.") && cancel.run(dealershipId, countId)}>Cancel count</Button>
          <Button variant="secondary" loading={save.pending} disabled={invalid} onClick={() => save.run(dealershipId, { countId, entries: entries() })}>Save progress</Button>
          <Button loading={complete.pending} disabled={invalid || counted === 0} onClick={async () => {
            if (!confirm(`Close the count and correct ${diffs} item${diffs === 1 ? "" : "s"}?`)) return;
            const r = await save.run(dealershipId, { countId, entries: entries() });
            if (r.ok) complete.run(dealershipId, countId);
          }}>Close count &amp; apply</Button>
        </div>
      </div>
    </div>
  );
}
