/** Console navigation model: shared by the sidebar, breadcrumbs, command palette and keyboard shortcuts. */
export type NavIcon =
  | "overview" | "workspaces" | "payments" | "plans" | "support" | "growth" | "status" | "mail"
  | "announcements" | "flags" | "settings" | "staff" | "audit" | "system" | "account";

export type NavItem = { href: string; label: string; icon: NavIcon; group: string; /** second key of the "g then …" shortcut */ key?: string; hint?: string };

export const NAV_GROUPS = ["", "Customers", "Support & growth", "Platform"] as const;

export const NAV_DEFS: (NavItem & { perm: string })[] = [
  { href: "/platform", label: "Overview", icon: "overview", group: "", key: "o", perm: "dashboard", hint: "Key figures and what needs attention" },
  { href: "/platform/workspaces", label: "Workspaces", icon: "workspaces", group: "Customers", key: "w", perm: "tenants.view", hint: "Every company on the platform" },
  { href: "/platform/payments", label: "Payments & invoices", icon: "payments", group: "Customers", key: "p", perm: "payments.manage", hint: "Confirm payments, invoices, refunds" },
  { href: "/platform/plans", label: "Plans & coupons", icon: "plans", group: "Customers", key: "l", perm: "plans.manage", hint: "Pricing and discount codes" },
  { href: "/platform/support", label: "Support tickets", icon: "support", group: "Support & growth", key: "s", perm: "support.manage", hint: "Customer questions and replies" },
  { href: "/platform/growth", label: "Growth", icon: "growth", group: "Support & growth", key: "g", perm: "reports", hint: "Signups, trials and campaigns" },
  { href: "/platform/mail", label: "Mail", icon: "mail", group: "Support & growth", key: "m", perm: "mail.manage", hint: "Inbox, templates and branding" },
  { href: "/platform/announcements", label: "Announcements", icon: "announcements", group: "Support & growth", key: "n", perm: "announcements.manage", hint: "Notices shown inside the app" },
  { href: "/platform/status", label: "Status page", icon: "status", group: "Support & growth", key: "u", perm: "status.manage", hint: "Public incident updates" },
  { href: "/platform/flags", label: "Feature flags", icon: "flags", group: "Platform", key: "f", perm: "flags.manage", hint: "Turn features on or off per workspace" },
  { href: "/platform/settings", label: "Settings", icon: "settings", group: "Platform", key: "t", perm: "settings.manage", hint: "Platform-wide settings" },
  { href: "/platform/admins", label: "Platform staff", icon: "staff", group: "Platform", key: "d", perm: "admins.manage", hint: "Who can sign in to this console" },
  { href: "/platform/audit", label: "Audit log", icon: "audit", group: "Platform", key: "a", perm: "audit.view", hint: "Every action, who did it and why" },
  { href: "/platform/system", label: "System", icon: "system", group: "Platform", key: "y", perm: "system.manage", hint: "Health, backups and jobs" },
];

export const ACCOUNT_ITEM: NavItem = { href: "/platform/account", label: "My account", icon: "account", group: "", key: "c", hint: "Your password and two-step sign-in" };

export const isActive = (path: string, href: string) => (href === "/platform" ? path === "/platform" : path === href || path.startsWith(href + "/"));
