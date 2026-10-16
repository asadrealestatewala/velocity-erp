"use client";
import { useEffect, useState } from "react";
import { useAction } from "@/components/ui/use-action";
import { assignTestDriveRepAction } from "@/server/actions/test-drives";
import { dealershipMembersAction } from "@/server/actions/lookups";

/** Lazy-loads the outlet's members on first focus. */
export function TestDriveRepSelect({ bookingId, dealershipId, current }: { bookingId: string; dealershipId: string; current: { id: string; name: string } | null }) {
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  const [load, setLoad] = useState(false);
  const { run, pending } = useAction(assignTestDriveRepAction, { success: "Representative updated" });
  useEffect(() => {
    if (!load || opts) return;
    dealershipMembersAction(dealershipId).then((r) => setOpts(r.ok ? (r.data ?? []) : []));
  }, [load, opts, dealershipId]);
  const list = opts ?? (current ? [current] : []);
  return (
    <select
      aria-label="Test-drive representative"
      className="input h-7 w-36 py-0 pr-7 text-xs"
      value={current?.id ?? ""}
      disabled={pending}
      onFocus={() => setLoad(true)}
      onMouseDown={() => setLoad(true)}
      onChange={(e) => run(bookingId, e.target.value || null)}
    >
      <option value="">Unassigned</option>
      {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
