import { describe, expect, it } from "vitest";
import { buildSetupChecklist, setupProgress } from "@/lib/setup-checklist";

const empty = { contacts: 0, dealerAssignedLeads: 0, tasks: 0, publishedForms: 0, activeUsers: 1 };
const all = () => true;

describe("setup checklist", () => {
  it("marks nothing done on an empty system and reports 0%", () => {
    const steps = buildSetupChecklist(empty, all);
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(setupProgress(steps)).toEqual({ done: 0, total: 5, pct: 0 });
  });
  it("derives each step from real counts", () => {
    const steps = buildSetupChecklist({ contacts: 3, dealerAssignedLeads: 0, tasks: 2, publishedForms: 1, activeUsers: 2 }, all);
    expect(Object.fromEntries(steps.map((s) => [s.key, s.done]))).toEqual({ contact: true, form: true, assign: false, task: true, team: true });
    expect(setupProgress(steps).pct).toBe(80);
  });
  it("only offers steps the user's permissions allow", () => {
    const steps = buildSetupChecklist(empty, (p) => p === "contacts.create" || p === "tasks.manage");
    expect(steps.map((s) => s.key)).toEqual(["contact", "task"]);
  });
  it("counts the sole admin as not yet 'a team'", () => {
    expect(buildSetupChecklist(empty, all).find((s) => s.key === "team")!.done).toBe(false);
  });
});
