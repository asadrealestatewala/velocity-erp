"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { updateOwnDealershipAction } from "@/server/actions/portal-settings";

const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;
type H = Record<string, { open: string; close: string; closed?: boolean }>;

export function DealershipSettingsForm({ id, initial }: { id: string; initial: { contactName: string | null; phone: string | null; email: string | null; repsSeeAllLeads: boolean; testDriveSlotCapacity: number; operatingHours: H } }) {
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction(updateOwnDealershipAction);
  const hours = v.operatingHours;
  return (
    <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); run(id, v); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Primary contact">{(p) => <Input {...p} value={v.contactName ?? ""} onChange={(e) => setV({ ...v, contactName: e.target.value })} />}</Field>
        <Field label="Phone">{(p) => <Input {...p} value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
        <Field label="Email" error={fieldErrors.email}>{(p) => <Input {...p} type="email" value={v.email ?? ""} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
        <Field label="Test-drive slot capacity" help="Bookings per 30 minutes (0 = no limit)">{(p) => <Input {...p} type="number" min={0} max={50} value={v.testDriveSlotCapacity} onChange={(e) => setV({ ...v, testDriveSlotCapacity: Number(e.target.value) })} />}</Field>
        <div className="pt-6 sm:col-span-2"><Checkbox label="Sales reps can see all of the dealership's leads" checked={v.repsSeeAllLeads} onChange={(e) => setV({ ...v, repsSeeAllLeads: e.target.checked })} /></div>
      </div>
      <div>
        <p className="label">Operating hours (used to validate test-drive bookings)</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS.map(([d, l]) => {
            const h = hours[d] ?? { open: "10:00", close: "19:00" };
            const upd = (patch: Partial<typeof h>) => setV({ ...v, operatingHours: { ...hours, [d]: { ...h, ...patch } } });
            return (
              <div key={d} className="flex items-center gap-2 rounded-xl border border-ink-200 p-2.5 text-sm">
                <span className="w-9 font-medium">{l}</span>
                {h.closed ? <span className="flex-1 text-ink-400">Closed</span> : (
                  <>
                    <Input aria-label={`${l} opens`} type="time" value={h.open} onChange={(e) => upd({ open: e.target.value })} className="h-8 py-1" />
                    <Input aria-label={`${l} closes`} type="time" value={h.close} onChange={(e) => upd({ close: e.target.value })} className="h-8 py-1" />
                  </>
                )}
                <input type="checkbox" aria-label={`${l} closed`} title="Closed" checked={!!h.closed} onChange={(e) => upd({ closed: e.target.checked })} className="accent-brand-500" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save settings</Button></div>
    </form>
  );
}
