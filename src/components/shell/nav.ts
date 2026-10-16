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
  { label: "Users & Permissions", href: "/crm/users", icon: "shield", perm: "users.manage", section: "Admin" },
  { label: "Audit Log", href: "/crm/audit", icon: "history", perm: "audit.view" },
  { label: "Settings", href: "/crm/settings", icon: "settings", perm: "settings.manage" },
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
  { label: "Team Performance", href: "/portal/team", icon: "users-round", section: "Performance", managerOnly: true },
  { label: "Leaderboard", href: "/portal/leaderboard", icon: "trophy" },
  { label: "Analytics", href: "/portal/analytics", icon: "bar-chart", perm: "reports.view" },
  { label: "Notifications", href: "/portal/notifications", icon: "bell" },
  { label: "Dealership Settings", href: "/portal/settings", icon: "settings" },
];
