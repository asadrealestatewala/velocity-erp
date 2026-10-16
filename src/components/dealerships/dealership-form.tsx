"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { saveDealershipAction, type DealershipInput } from "@/server/actions/dealerships";

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]] as const;
type Hours = Record<string, { open: string; close: string; closed?: boolean }>;

export function DealershipForm({
  id,
  initial,
  cities,
  provinces,
  parents,
}: {
  id: string | null;
  initial: Partial<DealershipInput>;
  cities: { id: string; name: string; provinceId: string }[];
  provinces: { id: string; name: string }[];
  parents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<DealershipInput>({
    name: "", code: "", type: "DEALERSHIP", cityId: "", operatingHours: {}, testDriveSlotCapacity: 0, repsSeeAllLeads: false, ...initial,
  });
  const [useHours, setUseHours] = useState(Object.keys((initial.operatingHours as Hours) ?? {}).length > 0);
  const { run, pending, fieldErrors, error } = useAction(saveDealershipAction, { onSuccess: (d) => d && router.push(`/crm/dealerships/${d.id}`) });
  const set = <K extends keyof DealershipInput>(k: K, val: DealershipInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const hours = (v.operatingHours ?? {}) as Hours;
  const cityOpts = useMemo(() => (v.provinceId ? cities.filter((c) => c.provinceId === v.provinceId) : cities), [cities, v.provinceId]);
  const str = (x: unknown) => (x == null ? "" : String(x));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(id, { ...v, operatingHours: useHours ? hours : {} });
      }}
    >
      <FormError error={error} />
      <Card>
        <CardHeader title="Identity" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dealership name" required error={fieldErrors.name} className="sm:col-span-2">{(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} />}</Field>
          <Field label="Code" required error={fieldErrors.code} help="e.g. LHR-03">{(p) => <Input {...p} value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />}</Field>
          <Field label="Type">
            {(p) => (
              <Select {...p} value={v.type} onChange={(e) => set("type", e.target.value as DealershipInput["type"])}>
                <option value="DEALERSHIP">Dealership</option><option value="OUTLET">Outlet</option><option value="FRANCHISE">Franchise</option><option value="SUB_DEALER">Sub-dealer</option>
              </Select>
            )}
          </Field>
          <Field label="Legal business name" className="sm:col-span-2">{(p) => <Input {...p} value={str(v.legalName)} onChange={(e) => set("legalName", e.target.value)} />}</Field>
          <Field label="Parent dealership / franchise" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={str(v.parentId)} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">None</option>
                {parents.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Contact & location" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Primary contact name">{(p) => <Input {...p} value={str(v.contactName)} onChange={(e) => set("contactName", e.target.value)} />}</Field>
          <Field label="Email" error={fieldErrors.email}>{(p) => <Input {...p} type="email" value={str(v.email)} onChange={(e) => set("email", e.target.value)} />}</Field>
          <Field label="Phone">{(p) => <Input {...p} value={str(v.phone)} onChange={(e) => set("phone", e.target.value)} />}</Field>
          <Field label="Opening date">{(p) => <Input {...p} type="date" value={str(v.openingDate).slice(0, 10)} onChange={(e) => set("openingDate", e.target.value as unknown as Date)} />}</Field>
          <Field label="Province / state">{(p) => <Select {...p} value={str(v.provinceId)} onChange={(e) => { set("provinceId", e.target.value); set("cityId", ""); }}><option value="">—</option>{provinces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
          <Field label="City" required error={fieldErrors.cityId}>{(p) => <Select {...p} value={v.cityId} onChange={(e) => set("cityId", e.target.value)}><option value="">Select…</option>{cityOpts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
          <Field label="Full address" className="sm:col-span-2">{(p) => <Input {...p} value={str(v.address)} onChange={(e) => set("address", e.target.value)} />}</Field>
          <Field label="Postal code">{(p) => <Input {...p} value={str(v.postalCode)} onChange={(e) => set("postalCode", e.target.value)} />}</Field>
          <Field label="Latitude" error={fieldErrors.latitude}>{(p) => <Input {...p} inputMode="decimal" value={str(v.latitude)} onChange={(e) => set("latitude", e.target.value as unknown as number)} />}</Field>
          <Field label="Longitude" error={fieldErrors.longitude}>{(p) => <Input {...p} inputMode="decimal" value={str(v.longitude)} onChange={(e) => set("longitude", e.target.value as unknown as number)} />}</Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Test drives & lead settings" description="Changing these never reassigns existing leads." />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test-drive slot capacity" help="Max overlapping bookings per 30-minute window. 0 = no limit.">{(p) => <Input {...p} type="number" min={0} max={50} value={str(v.testDriveSlotCapacity)} onChange={(e) => set("testDriveSlotCapacity", Number(e.target.value))} />}</Field>
            <div className="pt-6"><Checkbox label="Sales reps can see every lead of this dealership (otherwise only their own)" checked={!!v.repsSeeAllLeads} onChange={(e) => set("repsSeeAllLeads", e.target.checked)} /></div>
          </div>
          <Checkbox label="Enforce operating hours for test-drive bookings" checked={useHours} onChange={(e) => { setUseHours(e.target.checked); if (e.target.checked && !Object.keys(hours).length) set("operatingHours", Object.fromEntries(DAYS.map(([d]) => [d, { open: "10:00", close: "19:00", closed: d === "sun" }]))); }} />
          {useHours && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {DAYS.map(([d, label]) => {
                const h = hours[d] ?? { open: "10:00", close: "19:00" };
                const upd = (patch: Partial<typeof h>) => set("operatingHours", { ...hours, [d]: { ...h, ...patch } });
                return (
                  <div key={d} className="rounded-xl border border-ink-200 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">{label}</span><Checkbox label="Closed" checked={!!h.closed} onChange={(e) => upd({ closed: e.target.checked })} /></div>
                    {!h.closed && (
                      <div className="flex items-center gap-1.5">
                        <Input aria-label={`${label} opens`} type="time" value={h.open} onChange={(e) => upd({ open: e.target.value })} className="h-8 py-1" />
                        <span className="text-ink-400">–</span>
                        <Input aria-label={`${label} closes`} type="time" value={h.close} onChange={(e) => upd({ close: e.target.value })} className="h-8 py-1" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Field label="Internal notes">{(p) => <Textarea {...p} rows={3} value={str(v.notes)} onChange={(e) => set("notes", e.target.value)} />}</Field>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={pending}>{id ? "Save dealership" : "Create dealership"}</Button>
      </div>
    </form>
  );
}
