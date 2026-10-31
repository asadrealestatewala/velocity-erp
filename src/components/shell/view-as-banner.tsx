import { Eye } from "lucide-react";
import { endViewAsAction } from "@/server/actions/impersonation";
import { fmtDateTime } from "@/lib/utils";

/** Shown on every page while a platform operator is viewing as a user. Writes are blocked at the database layer. */
export function ViewAsBanner({ view }: { view: { adminEmail: string; reason: string; expiresAt: Date } | undefined | null }) {
  if (!view) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span className="inline-flex items-center gap-2"><Eye className="size-4" aria-hidden />Read-only view as platform support ({view.adminEmail}). Reason: {view.reason}. Ends {fmtDateTime(view.expiresAt)}.</span>
      <form action={endViewAsAction}><button type="submit" className="rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900">Exit view</button></form>
    </div>
  );
}
