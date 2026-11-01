"use client";
import { useState } from "react";
import { FileText, Plus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { addVehicleAction, assignVehicleAction, setRegistrationAction } from "@/server/actions/vehicles";

export function AddVehicleDialog({ dealershipId, models }: { dealershipId: string; models: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ bikeModelId: "", chassisNumber: "", engineNumber: "", color: "", note: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const { run, pending, fieldErrors } = useAction(addVehicleAction, { onSuccess: () => { setOpen(false); setF({ bikeModelId: "", chassisNumber: "", engineNumber: "", color: "", note: "" }); } });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Add vehicle"
      description="Record one physical bike by its chassis number. This does not change your stock count — adjust that on the Inventory page."
      trigger={<Button><Plus className="h-4 w-4" /> Add vehicle</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(dealershipId, f)}>Add vehicle</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" required error={fieldErrors.bikeModelId} className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={f.bikeModelId} onChange={set("bikeModelId")}>
              <option value="">Select a model…</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Chassis / VIN" required error={fieldErrors.chassisNumber}>{(p) => <Input {...p} className="font-mono uppercase" value={f.chassisNumber} onChange={set("chassisNumber")} />}</Field>
        <Field label="Engine / motor number" error={fieldErrors.engineNumber}>{(p) => <Input {...p} className="font-mono uppercase" value={f.engineNumber} onChange={set("engineNumber")} />}</Field>
        <Field label="Colour" error={fieldErrors.color}>{(p) => <Input {...p} value={f.color} onChange={set("color")} />}</Field>
        <Field label="Note" error={fieldErrors.note}>{(p) => <Input {...p} value={f.note} onChange={set("note")} />}</Field>
      </div>
    </Dialog>
  );
}

export type AssignableOrder = { id: string; label: string; bikeModelIds: string[] };

export function SellVehicleDialog({ dealershipId, vehicle, orders }: { dealershipId: string; vehicle: { id: string; chassisNumber: string; bikeModelId: string }; orders: AssignableOrder[] }) {
  const [open, setOpen] = useState(false);
  const [salesOrderId, setOrder] = useState("");
  const options = orders.filter((o) => o.bikeModelIds.includes(vehicle.bikeModelId));
  const { run, pending, fieldErrors } = useAction(assignVehicleAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`Assign ${vehicle.chassisNumber} to an order`}
      description="The order's customer becomes the owner of this vehicle."
      trigger={<Button size="xs" variant="secondary"><UserCheck className="h-3.5 w-3.5" /> Assign to order</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!salesOrderId} onClick={() => run(dealershipId, { vehicleId: vehicle.id, salesOrderId })}>Assign</Button></>}
    >
      {options.length === 0 ? (
        <p className="text-sm text-ink-600">There is no confirmed customer order for this model. Confirm an order first.</p>
      ) : (
        <Field label="Confirmed order" required error={fieldErrors.salesOrderId}>
          {(p) => (
            <Select {...p} value={salesOrderId} onChange={(e) => setOrder(e.target.value)}>
              <option value="">Select an order…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      )}
    </Dialog>
  );
}

export function RegistrationDialog({ dealershipId, vehicle }: { dealershipId: string; vehicle: { id: string; chassisNumber: string; registrationStatus: "NOT_REGISTERED" | "APPLIED" | "REGISTERED"; plateNumber: string | null } }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(vehicle.registrationStatus);
  const [plate, setPlate] = useState(vehicle.plateNumber ?? "");
  const { run, pending, fieldErrors } = useAction(setRegistrationAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`Registration — ${vehicle.chassisNumber}`}
      trigger={<Button size="xs" variant="secondary"><FileText className="h-3.5 w-3.5" /> Registration</Button>}
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(dealershipId, { vehicleId: vehicle.id, registrationStatus: status, plateNumber: plate })}>Save</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="NOT_REGISTERED">Not registered</option>
              <option value="APPLIED">Applied</option>
              <option value="REGISTERED">Registered</option>
            </Select>
          )}
        </Field>
        <Field label="Number plate" required={status === "REGISTERED"} error={fieldErrors.plateNumber}>{(p) => <Input {...p} className="font-mono uppercase" disabled={status === "NOT_REGISTERED"} value={plate} onChange={(e) => setPlate(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
