// Permission catalogue. Keys are referenced by server-side checks; the DB stores
// which role holds which key so administrators can reconfigure role grants.

export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", description: "View the central CRM dashboard" },
  "contacts.view": { group: "Contacts", description: "View contacts and leads in scope" },
  "contacts.create": { group: "Contacts", description: "Create contacts and leads" },
  "contacts.edit": { group: "Contacts", description: "Edit contacts and leads" },
  "contacts.archive": { group: "Contacts", description: "Archive or restore contacts" },
  "contacts.export": { group: "Contacts", description: "Export contacts to CSV" },
  "leads.view_all": { group: "Leads", description: "Organisation-wide lead visibility (central oversight)" },
  "leads.assign": { group: "Leads", description: "Assign / reassign leads to any dealership" },
  "leads.assign_team": { group: "Leads", description: "Assign leads to own dealership team members" },
  "leads.change_stage": { group: "Leads", description: "Move leads between pipeline stages" },
  "pipeline.configure": { group: "Leads", description: "Configure stages, loss reasons and sources" },
  "submissions.view": { group: "Forms", description: "View form submissions" },
  "submissions.manage": { group: "Forms", description: "Review, link and process submissions" },
  "forms.manage": { group: "Forms", description: "Create, edit and publish forms" },
  "testdrives.view": { group: "Test drives", description: "View test-drive bookings" },
  "testdrives.manage": { group: "Test drives", description: "Schedule and update test drives" },
  "dealerships.view": { group: "Dealerships", description: "View dealerships" },
  "dealerships.manage": { group: "Dealerships", description: "Create and manage dealerships, cities and outlets" },
  "applications.view": { group: "Dealerships", description: "View dealership applications" },
  "applications.review": { group: "Dealerships", description: "Review, approve and onboard applications" },
  "bikemodels.manage": { group: "Catalog", description: "Manage bike models" },
  "tasks.manage": { group: "Work", description: "Create and manage tasks" },
  "notes.manage": { group: "Work", description: "Add and edit notes" },
  "documents.view": { group: "Work", description: "View customer documents" },
  "documents.manage": { group: "Work", description: "Upload and remove customer documents" },
  "payments.view": { group: "Finance", description: "View payment records" },
  "payments.manage": { group: "Finance", description: "Record and update payments" },
  "reports.view": { group: "Reports", description: "View reports and analytics" },
  "users.manage": { group: "Administration", description: "Manage users, roles and permissions" },
  "team.manage": { group: "Administration", description: "Manage own dealership team members" },
  "settings.manage": { group: "Administration", description: "Manage system settings" },
  "audit.view": { group: "Administration", description: "View audit logs" },
  "gamification.manage": { group: "Administration", description: "Configure points, achievements and goals" },
  "portal.access": { group: "Portal", description: "Access the dealership portal" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MANAGEMENT: "MANAGEMENT",
  CRM_STAFF: "CRM_STAFF",
  DEALER_MANAGER: "DEALER_MANAGER",
  DEALER_REP: "DEALER_REP",
} as const;

export const DEFAULT_ROLES: {
  key: string;
  name: string;
  description: string;
  scope: "CENTRAL" | "DEALERSHIP";
  permissions: PermissionKey[];
}[] = [
  {
    key: ROLE_KEYS.SUPER_ADMIN,
    name: "Super Administrator",
    description: "Complete access to every module and setting",
    scope: "CENTRAL",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "portal.access" && p !== "leads.assign_team" && p !== "team.manage"),
  },
  {
    key: ROLE_KEYS.MANAGEMENT,
    name: "YADEA Management",
    description: "Organisation-wide dashboards, reports and oversight",
    scope: "CENTRAL",
    permissions: [
      "dashboard.view", "contacts.view", "contacts.export", "leads.view_all", "submissions.view",
      "testdrives.view", "dealerships.view", "applications.view", "applications.review",
      "documents.view", "payments.view", "reports.view", "audit.view",
    ],
  },
  {
    key: ROLE_KEYS.CRM_STAFF,
    name: "Sales & CRM Staff",
    description: "Manage contacts, leads, assignments and follow-ups",
    scope: "CENTRAL",
    permissions: [
      "dashboard.view", "contacts.view", "contacts.create", "contacts.edit", "contacts.archive", "contacts.export",
      "leads.view_all", "leads.assign", "leads.change_stage", "submissions.view", "submissions.manage",
      "testdrives.view", "testdrives.manage", "dealerships.view", "applications.view", "tasks.manage",
      "notes.manage", "documents.view", "documents.manage", "payments.view", "payments.manage", "reports.view",
    ],
  },
  {
    key: ROLE_KEYS.DEALER_MANAGER,
    name: "Dealership Manager",
    description: "Runs a dealership portal and its team",
    scope: "DEALERSHIP",
    permissions: [
      "portal.access", "contacts.view", "contacts.create", "contacts.edit", "contacts.export",
      "leads.assign_team", "leads.change_stage", "testdrives.view", "testdrives.manage", "tasks.manage",
      "notes.manage", "documents.view", "documents.manage", "payments.view", "payments.manage",
      "reports.view", "team.manage",
    ],
  },
  {
    key: ROLE_KEYS.DEALER_REP,
    name: "Dealership Sales Representative",
    description: "Works assigned leads inside the dealership portal",
    scope: "DEALERSHIP",
    permissions: [
      "portal.access", "contacts.view", "contacts.create", "contacts.edit", "leads.change_stage",
      "testdrives.view", "testdrives.manage", "tasks.manage", "notes.manage", "documents.view", "documents.manage",
    ],
  },
];
