"use client";
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnnouncementItem = { id: string; title: string; body: string; tone: "info" | "warn" | "danger" };
const KEY = "velocity.dismissed-announcements";

function read(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; }
}

/** Notices from the platform operator. Each can be dismissed per browser; they come back only if a new one is posted. */
export function AnnouncementBar({ items }: { items: AnnouncementItem[] }) {
  const [hidden, setHidden] = useState<string[] | null>(null);
  useEffect(() => setHidden(read()), []);
  if (hidden === null) return null; // avoid a flash of already-dismissed notices
  const shown = items.filter((i) => !hidden.includes(i.id));
  if (!shown.length) return null;
  const dismiss = (id: string) => {
    const next = [...hidden, id].slice(-50);
    setHidden(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  return (
    <div className="space-y-px">
      {shown.map((a) => (
        <div
          key={a.id}
          role="status"
          className={cn(
            "flex items-start gap-3 border-b px-4 py-2 text-sm sm:px-6 lg:px-8",
            a.tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : a.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-900",
          )}
        >
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1"><strong>{a.title}</strong> <span className="opacity-90">{a.body}</span></p>
          <button type="button" onClick={() => dismiss(a.id)} aria-label={`Dismiss: ${a.title}`} className="shrink-0 rounded p-0.5 hover:bg-black/5"><X className="size-4" aria-hidden /></button>
        </div>
      ))}
    </div>
  );
}
