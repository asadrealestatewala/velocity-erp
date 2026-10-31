import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { label: string; href: string; icon: string; perm?: PermissionKey; managerOnly?: boolean; section?: string };

export const CRM_NAV: NavItem[] = [
  { label: "Dashboard", href: "/crm/dashboard", icon: "layout-dashboard", perm: "dashboard.view" },
  { label: "Contacts", href: "/crm/contacts", icon: "users", perm: "contacts.view" },
  { label: "Leads Pipeline", href: "/crm/pipeline", icon: "kanban", perm: "contacts.view" },
  { label: "Form Submissions", href: "/crm/submissions", icon: "inbox", perm: "submissions.view" },
  { label: "Forms", href: "/crm/forms", icon: "file-text", perm: "forms.manage" },
  { label: "Test Drives", href: "/crm/test-drives", icon: "bike", perm: "testdrives.view" },
  { label: "Dealerships", href: "/crm/dealerships", icon: "store", perm: "dealerships.view", section: "Network" },
  { label: "Dealership Applications", href: "/crm/applications", icon: "file-check", perm: "applications.view" },
  { label: "Bike Models", href: "/crm/bike-models", icon: "zap", perm: "dealerships.view" },
  { label: "Tasks", href: "/crm/tasks", icon: "check-square", perm: "tasks.manage", section: "Work" },
  { label: "Reports & Analytics", href: "/crm/reports", icon: "bar-chart", perm: "reports.view" },
  { label: "Leaderboard", href: "/crm/leaderboard", icon: "trophy", perm: "reports.view" },
  { label: "Notifications", href: "/crm/notifications", icon: "bell" },
  { label: "Procurement & Accounts", href: "/procurement/dashboard", icon: "truck", perm: "procurement.view", section: "Operations" },
  { label: "Knowledge Base", href: "/crm/knowledge", icon: "book-open", perm: "settings.manage" },
  { label: "Users & Permissions", href: "/crm/users", icon: "shield", perm: "users.manage", section: "Admin" },
  { label: "Audit Log", href: "/crm/audit", icon: "history", perm: "audit.view" },
  { label: "Settings", href: "/crm/settings", icon: "settings", perm: "settings.manage" },
  { label: "Plan & billing", href: "/crm/billing", icon: "wallet", perm: "settings.manage" },
  { label: "Support", href: "/crm/support", icon: "life-buoy" },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "Dashboard", href: "/portal/dashboard", icon: "layout-dashboard" },
  { label: "My Leads", href: "/portal/leads?view=mine", icon: "user-check", section: "Leads" },
  { label: "All Dealership Leads", href: "/portal/leads", icon: "list" },
  { label: "Company-Assigned", href: "/portal/leads?origin=COMPANY", icon: "building" },
  { label: "Walk-in Leads", href: "/portal/leads?origin=DEALERSHIP_WALK_IN", icon: "footprints" },
  { label: "Pipeline", href: "/portal/pipeline", icon: "kanban" },
  { label: "Contacts", href: "/portal/contacts", icon: "users" },
  { label: "Test Drives", href: "/portal/test-drives", icon: "bike", section: "Work" },
  { label: "Tasks & Follow-ups", href: "/portal/tasks", icon: "check-square" },
  { label: "Inventory", href: "/portal/inventory", icon: "boxes", perm: "inventory.view", section: "Showroom" },
  { label: "Customer Orders", href: "/portal/sales-orders", icon: "clipboard-list", perm: "inventory.view" },
  { label: "Stock Orders", href: "/portal/stock-orders", icon: "truck", perm: "procurement.order" },
  { label: "Account Ledger", href: "/portal/ledger", icon: "wallet", perm: "ledger.view", section: "Accounts" },
  { label: "Expense Vouchers", href: "/portal/vouchers", icon: "receipt", perm: "vouchers.manage" },
  { label: "Documents", href: "/portal/documents", icon: "folder", perm: "dealerdocs.upload" },
  { label: "Team Performance", href: "/portal/team", icon: "users-round", section: "Performance", managerOnly: true },
  { label: "Audit Log", href: "/portal/audit", icon: "history", perm: "audit.view" },
  { label: "Leaderboard", href: "/portal/leaderboard", icon: "trophy" },
  { label: "Analytics", href: "/portal/analytics", icon: "bar-chart", perm: "reports.view" },
  { label: "Notifications", href: "/portal/notifications", icon: "bell" },
  { label: "Dealership Settings", href: "/portal/settings", icon: "settings" },
];

export const PROCUREMENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/procurement/dashboard", icon: "layout-dashboard", perm: "procurement.view" },
  { label: "Dealer Orders", href: "/procurement/orders", icon: "clipboard-list", perm: "procurement.view", section: "Orders" },
  { label: "Dispatch & Delivery", href: "/procurement/dispatch", icon: "truck", perm: "procurement.view" },
  { label: "Product Catalogue", href: "/procurement/catalog", icon: "package", perm: "catalog.manage", section: "Catalogue" },
  { label: "Dealer Stock", href: "/procurement/stock", icon: "boxes", perm: "inventory.view_all" },
  { label: "Dealerships", href: "/procurement/dealers", icon: "store", perm: "dealerships.view", section: "Dealers" },
  { label: "Ledgers & Payments", href: "/procurement/ledger", icon: "wallet", perm: "ledger.view" },
  { label: "Expense Vouchers", href: "/procurement/vouchers", icon: "receipt", perm: "vouchers.view_all" },
  { label: "Documents & Certificates", href: "/procurement/documents", icon: "folder", perm: "dealerdocs.admin" },
  { label: "Notifications", href: "/procurement/notifications", icon: "bell" },
];
