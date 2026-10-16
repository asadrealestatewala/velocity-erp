"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import {
  deleteGoalAction, moveStageAction, runJobsNowAction, saveAchievementAction, saveCityAction, saveCustomFieldAction, saveGoalAction,
  saveLossReasonAction, saveProvinceAction, saveSourceAction, saveStageAction, saveSystemSettingsAction,
} from "@/server/actions/settings";
import type { SystemSettings } from "@/server/settings";

type Stage = { id: string; name: string; color: string; kind: "OPEN" | "WON" | "LOST"; isActive: boolean; isDefault: boolean; notifyOnEnter: boolean; leads: number };

export function StagesPanel({ stages }: { stages: Stage[] }) {
  const save = useAction(saveStageAction);
  const move = useAction(moveStageAction, { refresh: true });
  const [draft, setDraft] = useState<Record<string, Stage>>(Object.fromEntries(stages.map((s) => [s.id, s])));
  const [nu, setNu] = useState({ name: "", color: "#64748b", kind: "OPEN" as Stage["kind"] });
  return (
    <div className="space-y-2 p-4">
      {stages.map((s, i) => {
        const d = draft[s.id] ?? s;
        const upd = (p: Partial<Stage>) => setDraft({ ...draft, [s.id]: { ...d, ...p } });
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 p-2.5">
            <div className="flex flex-col">
              <button aria-label="Move up" disabled={i === 0} onClick={() => move.run(s.id, -1)} className="rounded p-0.5 text-ink-400 hover:bg-ink-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button aria-label="Move down" disabled={i === stages.length - 1} onClick={() => move.run(s.id, 1)} className="rounded p-0.5 text-ink-400 hover:bg-ink-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <input type="color" aria-label="Stage colour" value={d.color} onChange={(e) => upd({ color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-ink-200" />
            <Input aria-label="Stage name" value={d.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 w-48" />
            <Select aria-label="Stage type" value={d.kind} onChange={(e) => upd({ kind: e.target.value as Stage["kind"] })} className="h-8 w-32 py-0">
              <option value="OPEN">Open</option><option value="WON">Converted (won)</option><option value="LOST">Lost</option>
            </Select>
            <Checkbox label="Active" checked={d.isActive} onChange={(e) => upd({ isActive: e.target.checked })} />
            <Checkbox label="Default" checked={d.isDefault} onChange={(e) => upd({ isDefault: e.target.checked })} />
            <Checkbox label="Notify on enter" checked={d.notifyOnEnter} onChange={(e) => upd({ notifyOnEnter: e.target.checked })} />
            <span className="ml-auto text-xs text-ink-400">{s.leads} leads</span>
            <Button size="xs" loading={save.pending} onClick={() => save.run(s.id, d)}>Save</Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-ink-300 p-2.5">
        <input type="color" aria-label="New stage colour" value={nu.color} onChange={(e) => setNu({ ...nu, color: e.target.value })} className="h-8 w-9 rounded border border-ink-200" />
        <Input aria-label="New stage name" placeholder="New stage name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} className="h-8 w-48" />
        <Select aria-label="New stage type" value={nu.kind} onChange={(e) => setNu({ ...nu, kind: e.target.value as Stage["kind"] })} className="h-8 w-32 py-0"><option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option></Select>
        <Button size="xs" disabled={!nu.name.trim()} loading={save.pending} onClick={() => save.run(null, { ...nu, isActive: true, isDefault: false, notifyOnEnter: false }).then((r) => r.ok && setNu({ name: "", color: "#64748b", kind: "OPEN" }))}><Plus className="h-3 w-3" /> Add stage</Button>
      </div>
    </div>
  );
}

export function NamedListPanel({ items, kind }: { items: { id: string; name: string; isActive: boolean; extra?: string }[]; kind: "loss" | "source" | "province" }) {
  const action = kind === "loss" ? saveLossReasonAction : kind === "province" ? saveProvinceAction : null;
  const saveSrc = useAction(saveSourceAction);
  const save = useAction(action ?? saveLossReasonAction);
  const [vals, setVals] = useState(Object.fromEntries(items.map((i) => [i.id, { name: i.name, isActive: i.isActive }])));
  const [nu, setNu] = useState("");
  return (
    <div className="space-y-1.5 p-4">
      {items.map((it) => {
        const v = vals[it.id]!;
        return (
          <div key={it.id} className="flex items-center gap-2">
            <Input aria-label="Name" value={v.name} onChange={(e) => setVals({ ...vals, [it.id]: { ...v, name: e.target.value } })} className="h-8" />
            {it.extra && <span className="w-28 shrink-0 truncate font-mono text-[11px] text-ink-400">{it.extra}</span>}
            <Checkbox label="Active" checked={v.isActive} onChange={(e) => setVals({ ...vals, [it.id]: { ...v, isActive: e.target.checked } })} />
            <Button size="xs" variant="secondary" loading={save.pending || saveSrc.pending} onClick={() => (kind === "source" ? saveSrc.run(it.id, v) : save.run(it.id, v))}>Save</Button>
          </div>
        );
      })}
      {kind !== "source" && (
        <div className="flex gap-2 pt-2">
          <Input aria-label="New item" placeholder={kind === "loss" ? "New loss reason" : "New province"} value={nu} onChange={(e) => setNu(e.target.value)} className="h-8" />
          <Button size="xs" disabled={!nu.trim()} onClick={() => save.run(null, { name: nu, isActive: true }).then((r) => r.ok && setNu(""))}><Plus className="h-3 w-3" /> Add</Button>
        </div>
      )}
      {kind === "source" && <p className="pt-2 text-xs text-ink-400">The 13 standard sources are fixed for consistent reporting; rename or deactivate them here.</p>}
    </div>
  );
}

export function CitiesPanel({ cities, provinces }: { cities: { id: string; name: string; provinceId: string; isActive: boolean; sortOrder: number; outlets: number }[]; provinces: { id: string; name: string }[] }) {
  const save = useAction(saveCityAction);
  const [vals, setVals] = useState(Object.fromEntries(cities.map((c) => [c.id, c])));
  const [nu, setNu] = useState({ name: "", provinceId: provinces[0]?.id ?? "", sortOrder: 0 });
  return (
    <div className="space-y-1.5 p-4">
      {cities.map((c) => {
        const v = vals[c.id]!;
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <Input aria-label="City name" value={v.name} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, name: e.target.value } })} className="h-8 w-40" />
            <Select aria-label="Province" value={v.provinceId} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, provinceId: e.target.value } })} className="h-8 w-48 py-0">{provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Input aria-label="Sort order" type="number" value={v.sortOrder} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, sortOrder: Number(e.target.value) } })} className="h-8 w-20" />
            <Checkbox label="Active" checked={v.isActive} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, isActive: e.target.checked } })} />
            <span className="text-xs text-ink-400">{c.outlets} outlet(s)</span>
            <Button size="xs" variant="secondary" className="ml-auto" loading={save.pending} onClick={() => save.run(c.id, v)}>Save</Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-2">
        <Input aria-label="New city" placeholder="New city" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} className="h-8 w-40" />
        <Select aria-label="New city province" value={nu.provinceId} onChange={(e) => setNu({ ...nu, provinceId: e.target.value })} className="h-8 w-48 py-0">{provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Button size="xs" disabled={!nu.name.trim()} onClick={() => save.run(null, { ...nu, isActive: true }).then((r) => r.ok && setNu({ ...nu, name: "" }))}><Plus className="h-3 w-3" /> Add city</Button>
      </div>
    </div>
  );
}

export function CustomFieldsPanel({ fields }: { fields: { id: string; entity: "CONTACT" | "LEAD"; key: string; label: string; type: "TEXT"; options: string[]; isActive: boolean }[] }) {
  const save = useAction(saveCustomFieldAction);
  const [nu, setNu] = useState({ entity: "CONTACT" as const, key: "", label: "", type: "TEXT" as "TEXT", options: "" });
  return (
    <div className="space-y-2 p-4">
      {fields.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
          <span className="font-medium">{f.label}</span><span className="font-mono text-xs text-ink-400">{f.key}</span><Badge tone="gray">{f.type.toLowerCase()}</Badge>
          {f.options.length > 0 && <span className="text-xs text-ink-500">{f.options.join(", ")}</span>}
          <span className="ml-auto"><Checkbox label="Active" checked={f.isActive} onChange={(e) => save.run(f.id, { ...f, isActive: e.target.checked })} /></span>
        </div>
      ))}
      <div className="grid gap-2 rounded-xl border border-dashed border-ink-300 p-3 sm:grid-cols-5">
        <Input aria-label="Label" placeholder="Label" value={nu.label} onChange={(e) => setNu({ ...nu, label: e.target.value, key: nu.key || "" })} className="h-8" />
        <Input aria-label="Key" placeholder="key_name" value={nu.key} onChange={(e) => setNu({ ...nu, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="h-8 font-mono text-xs" />
        <Select aria-label="Type" value={nu.type} onChange={(e) => setNu({ ...nu, type: e.target.value as "TEXT" })} className="h-8 py-0">
          {["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX", "TEXTAREA"].map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
        </Select>
        <Input aria-label="Options" placeholder="Options (comma-separated)" value={nu.options} onChange={(e) => setNu({ ...nu, options: e.target.value })} className="h-8" disabled={nu.type !== ("SELECT" as string)} />
        <Button size="sm" disabled={!nu.label || !nu.key} loading={save.pending} onClick={() => save.run(null, { ...nu, options: nu.options.split(",").map((s) => s.trim()).filter(Boolean), isActive: true }).then((r) => r.ok && setNu({ ...nu, key: "", label: "", options: "" }))}><Plus className="h-3 w-3" /> Add field</Button>
      </div>
    </div>
  );
}

export function PrivacyPanel({ s }: { s: SystemSettings }) {
  const save = useAction(saveSystemSettingsAction);
  const [v, setV] = useState({ privacyPolicyUrl: s.privacyPolicyUrl, consentText: s.consentText, defaultCountryCode: s.defaultCountryCode, duplicateMatching: s.duplicateMatching });
  return (
    <div className="space-y-4 p-4">
      <Field label="Privacy policy URL" help="Linked from every public form's consent checkbox.">{(p) => <Input {...p} value={v.privacyPolicyUrl} onChange={(e) => setV({ ...v, privacyPolicyUrl: e.target.value })} />}</Field>
      <Field label="Default consent wording" help='"Privacy Policy" in the text becomes a link. Each submission stores the exact wording shown.'>{(p) => <Textarea {...p} rows={3} value={v.consentText} onChange={(e) => setV({ ...v, consentText: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Default country code" help="Used to normalise local phone numbers (e.g. 03xx → 923xx)">{(p) => <Input {...p} value={v.defaultCountryCode} onChange={(e) => setV({ ...v, defaultCountryCode: e.target.value })} />}</Field>
        <div className="space-y-2 pt-6 sm:col-span-2">
          <p className="label">Duplicate matching rules</p>
          <Checkbox label="Match contacts by normalised phone number" checked={v.duplicateMatching.byPhone} onChange={(e) => setV({ ...v, duplicateMatching: { ...v.duplicateMatching, byPhone: e.target.checked } })} />
          <Checkbox label="Match contacts by normalised email" checked={v.duplicateMatching.byEmail} onChange={(e) => setV({ ...v, duplicateMatching: { ...v.duplicateMatching, byEmail: e.target.checked } })} />
        </div>
      </div>
      <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">A consent checkbox alone does not establish legal compliance. Have the policy, wording and retention periods reviewed for applicable data-protection obligations.</p>
      <div className="flex justify-end"><Button loading={save.pending} onClick={() => save.run(v)}>Save privacy settings</Button></div>
    </div>
  );
}

const POINT_LABELS: Record<string, string> = {
  FIRST_CONTACT: "Contacting a newly assigned lead", FAST_RESPONSE_BONUS: "Bonus: contacted within the response window", FOLLOW_UP_COMPLETED: "Completing a follow-up / call task",
  STAGE_ADVANCED: "Advancing a lead to a new stage (once per stage)", TEST_DRIVE_COMPLETED: "Completing a test drive", LEAD_CONVERTED: "Converting a lead", TASK_ON_TIME: "Completing a task on time",
};

export function GamificationPanel({ s, achievements, goals, dealerships }: {
  s: SystemSettings;
  achievements: { id: string; name: string; description: string; isActive: boolean; criteria: { eventType?: string; count?: number; totalPoints?: number } }[];
  goals: { id: string; name: string; metric: string; targetValue: number; dealership: string | null; startsAt: string; endsAt: string }[];
  dealerships: { id: string; name: string }[];
}) {
  const save = useAction(saveSystemSettingsAction);
  const saveAch = useAction(saveAchievementAction);
  const saveGoal = useAction(saveGoalAction);
  const delGoal = useAction(deleteGoalAction);
  const [g, setG] = useState(s.gamification);
  const [ach, setAch] = useState(Object.fromEntries(achievements.map((a) => [a.id, { name: a.name, description: a.description, isActive: a.isActive, count: a.criteria.count, totalPoints: a.criteria.totalPoints }])));
  const today = new Date().toISOString().slice(0, 10);
  const [goal, setGoal] = useState({ name: "", metric: "CONVERSIONS", targetValue: 5, dealershipId: "", startsAt: today, endsAt: today });
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-3">
        <Checkbox label="Gamification enabled (points, badges and leaderboards)" checked={g.enabled} onChange={(e) => setG({ ...g, enabled: e.target.checked })} />
        <Field label="Response window (hours) for the fast-response bonus">{(p) => <Input {...p} type="number" step="0.25" min={0.25} value={g.responseWindowHours} onChange={(e) => setG({ ...g, responseWindowHours: Number(e.target.value) })} className="w-32" />}</Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(g.points).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <Input aria-label={`${POINT_LABELS[k] ?? k} points`} type="number" min={0} value={v} onChange={(e) => setG({ ...g, points: { ...g.points, [k]: Number(e.target.value) } })} className="h-8 w-20" />
              <span className="text-ink-700">{POINT_LABELS[k] ?? k}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-500">Each award is tied to a unique business event (lead, task or booking) and can only be earned once — repeating or reversing actions never re-awards points.</p>
        <div className="flex justify-end"><Button loading={save.pending} onClick={() => save.run({ gamification: g })}>Save points</Button></div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Achievements</p>
        <div className="space-y-2">
          {achievements.map((a) => {
            const v = ach[a.id]!;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 p-2.5">
                <Input aria-label="Badge name" value={v.name} onChange={(e) => setAch({ ...ach, [a.id]: { ...v, name: e.target.value } })} className="h-8 w-44" />
                <Input aria-label="Badge description" value={v.description} onChange={(e) => setAch({ ...ach, [a.id]: { ...v, description: e.target.value } })} className="h-8 min-w-[200px] flex-1" />
                {a.criteria.eventType ? (
                  <span className="flex items-center gap-1 text-xs text-ink-500">after <Input aria-label="Threshold" type="number" min={1} value={v.count ?? 1} onChange={(e) => setAch({ ...ach, [a.id]: { ...v, count: Number(e.target.value) } })} className="h-8 w-16" /> × {a.criteria.eventType.toLowerCase().replace(/_/g, " ")}</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-ink-500">at <Input aria-label="Points threshold" type="number" min={1} value={v.totalPoints ?? 100} onChange={(e) => setAch({ ...ach, [a.id]: { ...v, totalPoints: Number(e.target.value) } })} className="h-8 w-20" /> points</span>
                )}
                <Checkbox label="Active" checked={v.isActive} onChange={(e) => setAch({ ...ach, [a.id]: { ...v, isActive: e.target.checked } })} />
                <Button size="xs" variant="secondary" loading={saveAch.pending} onClick={() => saveAch.run(a.id, v)}>Save</Button>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Goals & targets</p>
        <div className="mb-3 grid gap-2 rounded-xl border border-dashed border-ink-300 p-3 sm:grid-cols-6">
          <Input aria-label="Goal name" placeholder="Goal name" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} className="h-8 sm:col-span-2" />
          <Select aria-label="Metric" value={goal.metric} onChange={(e) => setGoal({ ...goal, metric: e.target.value })} className="h-8 py-0">
            <option value="CONVERSIONS">Conversions</option><option value="TEST_DRIVES_COMPLETED">Test drives completed</option><option value="FOLLOW_UP_COMPLETION_RATE">Follow-up completion %</option><option value="RESPONSE_TIME_HOURS">Avg response (h, lower = better)</option><option value="SALES_REVENUE">Monthly sales (PKR)</option>
          </Select>
          <Input aria-label="Target" type="number" min={0} value={goal.targetValue} onChange={(e) => setGoal({ ...goal, targetValue: Number(e.target.value) })} className="h-8" />
          <Select aria-label="Dealership" value={goal.dealershipId} onChange={(e) => setGoal({ ...goal, dealershipId: e.target.value })} className="h-8 py-0"><option value="">All active dealerships</option>{dealerships.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <div className="flex gap-1">
            <Input aria-label="Start" type="date" value={goal.startsAt} onChange={(e) => setGoal({ ...goal, startsAt: e.target.value })} className="h-8 px-1 text-xs" />
            <Input aria-label="End" type="date" value={goal.endsAt} onChange={(e) => setGoal({ ...goal, endsAt: e.target.value })} className="h-8 px-1 text-xs" />
          </div>
          <Button size="sm" className="sm:col-span-6 sm:justify-self-end" disabled={!goal.name} loading={saveGoal.pending} onClick={() => saveGoal.run({ ...goal, dealershipId: goal.dealershipId || null, endsAt: `${goal.endsAt}T23:59:59` })}><Plus className="h-3 w-3" /> Create goal</Button>
        </div>
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
          {goals.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">{x.name} <span className="text-ink-400">· {x.metric.toLowerCase().replace(/_/g, " ")} ≥ {x.targetValue} · {x.dealership ?? "—"} · {x.startsAt} → {x.endsAt}</span></span>
              <button aria-label="Delete goal" className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => delGoal.run(x.id)}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {goals.length === 0 && <li className="px-3 py-3 text-sm text-ink-400">No goals.</li>}
        </ul>
      </div>
    </div>
  );
}

export function OperationsPanel({ s, status }: { s: SystemSettings; status: { smtp: boolean; storage: string; outbox: Record<string, number> } }) {
  const save = useAction(saveSystemSettingsAction);
  const jobs = useAction(runJobsNowAction);
  const [n, setN] = useState(s.notifications);
  const [td, setTd] = useState(s.testDrive);
  return (
    <div className="space-y-5 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Checkbox label="Queue email copies of notifications (delivered only when SMTP is configured)" checked={n.emailEnabled} onChange={(e) => setN({ ...n, emailEnabled: e.target.checked })} />
          <Field label="Upcoming test-drive reminder (hours before)">{(p) => <Input {...p} type="number" min={1} max={168} value={n.upcomingTestDriveHours} onChange={(e) => setN({ ...n, upcomingTestDriveHours: Number(e.target.value) })} className="w-32" />}</Field>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold">Test-drive booking rules</p>
          <Field label="Minimum notice (hours)">{(p) => <Input {...p} type="number" min={0} max={72} value={td.minLeadHours} onChange={(e) => setTd({ ...td, minLeadHours: Number(e.target.value) })} className="w-32" />}</Field>
          <Field label="Book up to (days ahead)">{(p) => <Input {...p} type="number" min={1} max={365} value={td.maxDaysAhead} onChange={(e) => setTd({ ...td, maxDaysAhead: Number(e.target.value) })} className="w-32" />}</Field>
        </div>
      </div>
      <div className="flex justify-end"><Button loading={save.pending} onClick={() => save.run({ notifications: n, testDrive: td })}>Save</Button></div>
      <div className="rounded-xl bg-ink-50 p-4 text-sm">
        <p className="mb-2 font-semibold">System status</p>
        <ul className="space-y-1 text-ink-600">
          <li>Email (SMTP): {status.smtp ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured — emails are recorded as skipped</Badge>}</li>
          <li>File storage: <Badge tone="gray">{status.storage}</Badge></li>
          <li>Email outbox: {Object.entries(status.outbox).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ") || "empty"}</li>
        </ul>
        <Button size="sm" variant="secondary" className="mt-3" loading={jobs.pending} onClick={() => jobs.run()}><Play className="h-4 w-4" /> Run reminders & email delivery now</Button>
        <p className="mt-2 text-xs text-ink-500">In production schedule <code>POST /api/jobs/run</code> (header <code>x-cron-secret</code>) every 5–15 minutes.</p>
      </div>
    </div>
  );
}
