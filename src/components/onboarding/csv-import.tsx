"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import type { ActionResult } from "@/server/errors";
import type { ImportSummary } from "@/server/actions/onboarding";

/** Paste-or-upload CSV importer with a downloadable template and a per-row issue report. */
export function CsvImport({ dealershipId, action, header, example, noun }: {
  dealershipId: string;
  action: (dealershipId: string, csv: string) => Promise<ActionResult<ImportSummary>>;
  header: string[];
  example: string;
  noun: string;
}) {
  const [csv, setCsv] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const { run, pending } = useAction(action, { onSuccess: (d) => { setSummary(d ?? null); if (d && d.created > 0) setCsv(""); } });
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${header.join(",")}\r\n${example}\r\n`)}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a href={template} download={`${noun}-template.csv`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
          <Download className="h-4 w-4" aria-hidden /> Download template
        </a>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">
          <Upload className="h-4 w-4" aria-hidden /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setSummary(null); } e.target.value = ""; }} />
        </label>
      </div>
      <Textarea rows={8} className="font-mono text-xs" aria-label={`${noun} CSV`} placeholder={`${header.join(",")}\n${example}`} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <Button loading={pending} disabled={!csv.trim()} onClick={() => run(dealershipId, csv)}>Import {noun}</Button>
      {summary && (
        <div className="rounded-xl border border-ink-100 bg-ink-50 p-3 text-sm" role="status">
          <p className="font-medium text-ink-900">{summary.created} imported · {summary.skipped} skipped</p>
          {summary.issues.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto text-xs text-ink-600">
              {summary.issues.map((i, k) => <li key={k}>Row {i.line}: {i.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
