/** First-run guidance for the central CRM. Completion is derived from real records — nothing is stored or faked. */
export type SetupCounts = { contacts: number; dealerAssignedLeads: number; tasks: number; publishedForms: number; activeUsers: number };
export type SetupStep = { key: string; label: string; hint: string; href: string; done: boolean };

type Can = (perm: string) => boolean;

export function buildSetupChecklist(counts: SetupCounts, can: Can): SetupStep[] {
  const steps: (SetupStep & { perm: string })[] = [
    { key: "contact", perm: "contacts.create", label: "Add your first contact", hint: "Capture a customer or lead by hand, or let a public form do it.", href: "/crm/contacts/new", done: counts.contacts > 0 },
    { key: "form", perm: "forms.manage", label: "Publish a public form", hint: "Test-drive and inquiry forms feed leads straight into the CRM.", href: "/crm/forms", done: counts.publishedForms > 0 },
    { key: "assign", perm: "leads.assign", label: "Assign a lead to a dealership", hint: "Routed leads appear in that dealership's portal.", href: "/crm/contacts?assigned=no", done: counts.dealerAssignedLeads > 0 },
    { key: "task", perm: "tasks.manage", label: "Schedule a follow-up", hint: "Follow-ups keep leads moving and earn XP when completed on time.", href: "/crm/tasks", done: counts.tasks > 0 },
    { key: "team", perm: "users.manage", label: "Invite a team member", hint: "Give colleagues their own sign-in and role.", href: "/crm/users", done: counts.activeUsers > 1 },
  ];
  return steps.filter((s) => can(s.perm)).map(({ perm: _perm, ...s }) => s);
}

export const setupProgress = (steps: SetupStep[]) => ({ done: steps.filter((s) => s.done).length, total: steps.length, pct: steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 100 });
