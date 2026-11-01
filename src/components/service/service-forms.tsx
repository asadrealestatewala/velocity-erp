"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/misc";
import { CustomerPicker, type PickedCustomer } from "@/components/service/customer-picker";
import { createServiceBookingAction, openJobCardAction } from "@/server/actions/service-workshop";
import { SERVICE_TYPES } from "@/lib/ops-constants";
import type { JobCardInput, ServiceBookingInput } from "@/lib/validation-ops";

type Tech = { id: string; name: string };

function CustomerAndVehicle({ customer, setCustomer, v, set, errors }: { customer: PickedCustomer | null; setCustomer: (c: PickedCustomer | null) => void; v: Record<string, string>; set: (k: string, val: string) => void; errors: Record<string, string> }) {
  return (
    <>
      <Card>
        <CardHeader title="Customer" description="Link a contact so the visit shows in their history, or just type a name." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><CustomerPicker value={customer} onChange={setCustomer} /></div>
          {!customer && (
            <>
              <Field label="…or customer name" error={errors.customerName}>{(p) => <Input {...p} value={v.customerName} onChange={(e) => set("customerName", e.target.value)} />}</Field>
              <Field label="Phone" error={errors.customerPhone}>{(p) => <Input {...p} inputMode="tel" value={v.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />}</Field>
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Vehicle" description="Optional details to identify the vehicle." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Model / description" error={errors.vehicleLabel}>{(p) => <Input {...p} value={v.vehicleLabel} onChange={(e) => set("vehicleLabel", e.target.value)} />}</Field>
          <Field label="Number plate" error={errors.plateNumber}>{(p) => <Input {...p} className="uppercase" value={v.plateNumber} onChange={(e) => set("plateNumber", e.target.value)} />}</Field>
          <Field label="Chassis / VIN" error={errors.chassisNo}>{(p) => <Input {...p} className="uppercase" value={v.chassisNo} onChange={(e) => set("chassisNo", e.target.value)} />}</Field>
        </div>
      </Card>
    </>
  );
}

const blank = { customerName: "", customerPhone: "", vehicleLabel: "", plateNumber: "", chassisNo: "" };

export function BookingForm({ dealershipId, technicians, initialCustomer }: { dealershipId: string; technicians: Tech[]; initialCustomer?: PickedCustomer }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer ?? null);
  const [v, setV] = useState<Record<string, string>>({ ...blank, serviceType: SERVICE_TYPES[0], date: "", time: "10:00", assignedUserId: "", notes: "" });
  const [confirmNow, setConfirmNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    setBusy(true); setError(null); setErrors({});
    const res = await createServiceBookingAction(dealershipId, { ...v, contactId: customer?.id ?? null, customerName: customer ? null : v.customerName, customerPhone: customer ? null : v.customerPhone, confirmNow } as ServiceBookingInput);
    setBusy(false);
    if (res.ok) {
      toast.success(res.message ?? "Booking saved.");
      router.push("/portal/service/bookings");
      router.refresh();
    } else { setError(res.error); setErrors(res.fieldErrors ?? {}); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <CustomerAndVehicle customer={customer} setCustomer={setCustomer} v={v} set={set} errors={errors} />
      <Card>
        <CardHeader title="Appointment" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Service type" error={errors.serviceType}>{(p) => <Select {...p} value={v.serviceType} onChange={(e) => set("serviceType", e.target.value)}>{SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
          <Field label="Assign to (optional)" error={errors.assignedUserId}>{(p) => <Select {...p} value={v.assignedUserId} onChange={(e) => set("assignedUserId", e.target.value)}><option value="">Unassigned</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
          <Field label="Date" error={errors.date}>{(p) => <Input {...p} type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />}</Field>
          <Field label="Time" error={errors.time}>{(p) => <Input {...p} type="time" value={v.time} onChange={(e) => set("time", e.target.value)} />}</Field>
          <Field label="Notes" className="sm:col-span-2" error={errors.notes}>{(p) => <Textarea {...p} placeholder="What does the customer need?" value={v.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
          <Checkbox className="sm:col-span-2" label="Confirm the booking now" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
        </div>
      </Card>
      <FormError error={error} />
      <Button loading={busy} onClick={submit}>Book service</Button>
    </div>
  );
}

export function JobCardForm({ dealershipId, technicians, initialCustomer }: { dealershipId: string; technicians: Tech[]; initialCustomer?: PickedCustomer }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer ?? null);
  const [v, setV] = useState<Record<string, string>>({ ...blank, odometerKm: "", complaint: "", technicianId: "" });
  const [isWarranty, setIsWarranty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    setBusy(true); setError(null); setErrors({});
    const res = await openJobCardAction(dealershipId, { ...v, contactId: customer?.id ?? null, customerName: customer ? null : v.customerName, customerPhone: customer ? null : v.customerPhone, isWarranty } as JobCardInput);
    setBusy(false);
    if (res.ok) {
      toast.success(res.message ?? "Job card opened.");
      router.push(`/portal/service/${(res.data as { id: string }).id}`);
      router.refresh();
    } else { setError(res.error); setErrors(res.fieldErrors ?? {}); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <CustomerAndVehicle customer={customer} setCustomer={setCustomer} v={v} set={set} errors={errors} />
      <Card>
        <CardHeader title="Work requested" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Complaint / work requested" className="sm:col-span-2" error={errors.complaint}>{(p) => <Textarea {...p} value={v.complaint} onChange={(e) => set("complaint", e.target.value)} />}</Field>
          <Field label="Odometer (km)" error={errors.odometerKm}>{(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={v.odometerKm} onChange={(e) => set("odometerKm", e.target.value)} />}</Field>
          <Field label="Technician" error={errors.technicianId}>{(p) => <Select {...p} value={v.technicianId} onChange={(e) => set("technicianId", e.target.value)}><option value="">Unassigned</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
          <Checkbox className="sm:col-span-2" label="Warranty job — the customer is not charged; the cost is claimed from YADEA" checked={isWarranty} onChange={(e) => setIsWarranty(e.target.checked)} />
        </div>
      </Card>
      <FormError error={error} />
      <Button loading={busy} onClick={submit}>Open job card</Button>
    </div>
  );
}
