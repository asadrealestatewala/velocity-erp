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
  "audit.view": { group: "Administration", description: "View audit logs (central: all; dealership: its own)" },
  "gamification.manage": { group: "Administration", description: "Configure points, achievements and goals" },
  "portal.access": { group: "Portal", description: "Access the dealership portal" },

  // ── Showroom inventory & sales orders
  "inventory.view": { group: "Inventory", description: "View the showroom's stock (bikes and spare parts)" },
  "inventory.manage": { group: "Inventory", description: "Add opening stock and adjust the showroom's inventory" },
  "inventory.view_all": { group: "Inventory", description: "View every dealership's inventory (central)" },
  "salesorders.manage": { group: "Inventory", description: "Create, confirm and cancel customer sales orders (deducts stock)" },

  // ── Procurement (stock orders to YADEA)
  "procurement.order": { group: "Procurement", description: "Place and track stock orders with YADEA procurement; confirm receipt" },
  "procurement.view": { group: "Procurement", description: "View all dealership stock orders (central)" },
  "procurement.manage": { group: "Procurement", description: "Approve, price, dispatch and deliver stock orders (central)" },
  "catalog.manage": { group: "Procurement", description: "Manage spare parts and dealer pricing" },

  // ── Accounts: ledger, vouchers, documents
  "ledger.view": { group: "Accounts", description: "View the dealer account ledger and export it" },
  "ledger.pay": { group: "Accounts", description: "Record payments to YADEA with proof of payment (dealership)" },
  "ledger.manage": { group: "Accounts", description: "Post invoices, verify payments and adjust dealer ledgers (central)" },
  "vouchers.manage": { group: "Accounts", description: "Create expense vouchers and attach receipts / invoices (dealership)" },
  "vouchers.view_all": { group: "Accounts", description: "View and review every dealership's vouchers (central)" },
  "dealerdocs.upload": { group: "Accounts", description: "Upload the dealership's own documents (e.g. registration certificate)" },
  "dealerdocs.admin": { group: "Accounts", description: "Manage dealership documents and issue achievement certificates (central)" },

  // ── Messaging & assistant
  "messages.send": { group: "Messaging", description: "Send and log WhatsApp / email messages to contacts" },
  "assistant.use": { group: "Assistant", description: "Use the AI assistant" },
  "assistant.write": { group: "Assistant", description: "Let the assistant propose data changes (always confirmed before saving)" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MANAGEMENT: "MANAGEMENT",
  CRM_STAFF: "CRM_STAFF",
  PROCUREMENT: "PROCUREMENT",
  DEALER_MANAGER: "DEALER_MANAGER",
  DEALER_REP: "DEALER_REP",
} as const;

/** Permissions that only make sense inside a dealership membership — never granted to central roles. */
export const DEALER_ONLY_PERMISSIONS: PermissionKey[] = [
  "portal.access", "leads.assign_team", "team.manage", "inventory.view", "inventory.manage", "salesorders.manage",
  "procurement.order", "ledger.pay", "vouchers.manage", "dealerdocs.upload",
];

/**
 * Changes to the default role grants that must reach databases created before this release. Each upgrade is applied
 * once per database (recorded in settings) — an administrator who later removes a grant is never overridden again.
 */
export const DEFAULT_GRANT_UPGRADES: { id: string; grants: Record<string, PermissionKey[]> }[] = [
  {
    id: "2026-10-operations",
    grants: {
      DEALER_MANAGER: ["audit.view", "assistant.write"],
      DEALER_REP: ["assistant.write"],
      CRM_STAFF: ["assistant.write"],
      PROCUREMENT: ["assistant.write"],
    },
  },
];

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
    permissions: ALL_PERMISSIONS.filter((p) => !DEALER_ONLY_PERMISSIONS.includes(p)),
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
      "inventory.view_all", "procurement.view", "ledger.view", "vouchers.view_all", "assistant.use",
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
      "messages.send", "assistant.use", "assistant.write",
    ],
  },
  {
    key: ROLE_KEYS.PROCUREMENT,
    name: "Procurement & Accounts",
    description: "Receives dealership stock orders, dispatches goods, keeps dealer ledgers and reviews vouchers",
    scope: "CENTRAL",
    permissions: [
      "procurement.view", "procurement.manage", "catalog.manage", "inventory.view_all", "ledger.view", "ledger.manage",
      "vouchers.view_all", "dealerships.view", "dealerdocs.admin", "assistant.use", "assistant.write",
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
      "reports.view", "team.manage", "audit.view",
      "inventory.view", "inventory.manage", "salesorders.manage", "procurement.order", "ledger.view", "ledger.pay",
      "vouchers.manage", "dealerdocs.upload", "messages.send", "assistant.use", "assistant.write",
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
      "inventory.view", "salesorders.manage", "messages.send", "assistant.use", "assistant.write",
    ],
  },
];
