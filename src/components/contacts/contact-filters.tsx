import { FilterBar } from "@/components/filters/filter-bar";
import type { Lookups } from "@/server/lookups";
import { opt } from "@/server/lookups";

export function ContactFilters({ lk, reps, central }: { lk: Lookups; reps: { id: string; name: string }[]; central: boolean }) {
  return (
    <FilterBar
      keep={["pageSize"]}
      filters={[
        { type: "search", name: "q", label: "Search", placeholder: "Name, phone, email, business…" },
        { type: "select", name: "type", label: "Any type", options: [{ value: "LEAD", label: "Lead" }, { value: "CUSTOMER", label: "Customer" }] },
        { type: "select", name: "stage", label: "Any stage", options: opt(lk.stages) },
        { type: "select", name: "source", label: "Any source", options: opt(lk.sources) },
        { type: "select", name: "city", label: "Any city", options: opt(lk.cities) },
        ...(central ? [{ type: "select" as const, name: "dealership", label: "Any dealership", options: opt(lk.dealerships) }] : []),
        { type: "select", name: "rep", label: "Any sales rep", options: opt(reps) },
        {
          type: "select", name: "testDrive", label: "Test-drive status",
          options: [
            { value: "none", label: "No test drive" }, { value: "REQUESTED", label: "Requested" }, { value: "CONFIRMED", label: "Confirmed" },
            { value: "COMPLETED", label: "Completed" }, { value: "CANCELLED", label: "Cancelled" }, { value: "NO_SHOW", label: "No-show" },
          ],
        },
        ...(central ? [{ type: "select" as const, name: "assigned", label: "Assigned / unassigned", options: [{ value: "yes", label: "Assigned to dealer" }, { value: "no", label: "Unassigned" }] }] : []),
        { type: "select", name: "origin", label: "Any origin", options: [{ value: "COMPANY", label: "Company-assigned" }, { value: "DEALERSHIP_WALK_IN", label: "Walk-in" }] },
        { type: "select", name: "followUp", label: "Follow-up", options: [{ value: "due", label: "Due / overdue" }] },
        { type: "select", name: "archived", label: "Active records", options: [{ value: "yes", label: "Archived records" }] },
        { type: "daterange", from: "createdFrom", to: "createdTo", label: "Created" },
        { type: "daterange", from: "activityFrom", to: "activityTo", label: "Last activity" },
      ]}
    />
  );
}
