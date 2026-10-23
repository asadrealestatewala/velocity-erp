"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { GrowBar } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { SetupStep } from "@/lib/setup-checklist";

/** Getting-started card. It disappears when every step is done, and can be hidden per browser. */
export function SetupChecklist({ steps, userId }: { steps: SetupStep[]; userId: string }) {
  const key = `yadea:setup-hidden:${userId}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      /* storage unavailable — keep it visible */
    }
  }, [key]);
  const done = steps.filter((s) => s.done).length;
  if (hidden || steps.length === 0 || done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <section aria-label="Getting started" className="card reveal mb-4 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Rocket className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink-900">Get set up — {done} of {steps.length} done</h2>
          <p className="text-[13px] text-ink-500">Next: <b className="font-medium text-ink-700">{next.label}</b></p>
          <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Setup progress">
            <GrowBar pct={(done / steps.length) * 100} className="h-full rounded-full" color="var(--color-brand-600)" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } setHidden(true); }}
          aria-label="Hide the setup guide"
          title="Hide"
          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-ink-100">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 px-5 py-2.5">
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", s.done ? "bg-emerald-500 text-white" : "border-2 border-ink-200")} aria-hidden>
              {s.done && <Check className="h-3 w-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", s.done ? "text-ink-400 line-through" : "text-ink-900")}>{s.label}</p>
              {!s.done && <p className="text-xs text-ink-500">{s.hint}</p>}
            </div>
            {!s.done && (
              <Link href={s.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                Start <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
