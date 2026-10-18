/** Where a signed-in user lands: each kind of user has their own home. */
export function homePathFor(scope: "CENTRAL" | "DEALERSHIP", permissions: ReadonlySet<string>) {
  if (scope === "DEALERSHIP") return "/portal/dashboard";
  if (permissions.has("dashboard.view")) return "/crm/dashboard";
  if (permissions.has("procurement.view")) return "/procurement/dashboard";
  return "/crm/notifications";
}
