import { currentStatus, recentIncidents, type Level } from "@/server/platform/status";
import { fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "System status", description: "Current availability and recent incidents." };

const WORD: Record<Level, string> = { ok: "Operational", degraded: "Degraded", down: "Outage" };
const HEAD: Record<Level, string> = { ok: "All systems operational", degraded: "Some things are degraded", down: "We are having a problem" };
const DOT: Record<Level, string> = { ok: "bg-emerald-500", degraded: "bg-amber-500", down: "bg-red-500" };

export default async function StatusPage() {
  let s: Awaited<ReturnType<typeof currentStatus>> | null = null;
  let past: Awaited<ReturnType<typeof recentIncidents>> = [];
  try {
    s = await currentStatus();
    past = await recentIncidents();
  } catch { /* shown below */ }
  const overall: Level = s?.overall ?? "down";
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">System status</h1>
      <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-lg font-medium">
        <span className={`size-3 rounded-full ${DOT[overall]}`} aria-hidden /> {HEAD[overall]}
      </p>
      {s && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {s.components.map((c) => (
            <li key={c.key} className="flex items-start justify-between gap-3 px-4 py-3">
              <span>{c.label}{c.note && <span className="block text-xs text-slate-500">{c.note}</span>}</span>
              <span className="flex items-center gap-2 whitespace-nowrap"><span className={`size-2 rounded-full ${DOT[c.level]}`} aria-hidden />{WORD[c.level]}</span>
            </li>
          ))}
        </ul>
      )}
      {s && s.open.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Current incidents</h2>
          {s.open.map((i) => (
            <article key={i.id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <h3 className="font-medium">{i.title} <span className="text-xs font-normal text-slate-500">· {i.impact === "major" ? "major" : "minor"} · since {fmtDateTime(i.startedAt)}</span></h3>
              <p className="mt-1 whitespace-pre-line text-slate-700">{i.body}</p>
            </article>
          ))}
        </section>
      )}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Past 30 days</h2>
        {past.length === 0 ? <p className="mt-2 text-sm text-slate-600">No incidents reported.</p> : past.map((i) => (
          <article key={i.id} className="mt-3 text-sm">
            <h3 className="font-medium">{i.title} <span className="text-xs font-normal text-slate-500">· resolved {fmtDateTime(i.resolvedAt!)}</span></h3>
            <p className="whitespace-pre-line text-slate-600">{i.body}</p>
          </article>
        ))}
      </section>
      <p className="mt-8 text-xs text-slate-500">Checked {fmtDateTime(s?.checkedAt ?? new Date())}. These checks cover this platform only, not your own internet connection.</p>
    </main>
  );
}
