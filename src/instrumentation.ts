// Runs once per server process before any request is handled.
// All business dates (test-drive slots, operating hours, "today" on dashboards) use APP_TIMEZONE.
export async function register() {
  process.env.TZ = process.env.APP_TIMEZONE || "Asia/Karachi";

  // Keep the permission catalogue and default roles in sync after upgrades (idempotent; see permission-sync.ts).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { syncPermissionCatalog } = await import("@/server/permission-sync");
      const r = await syncPermissionCatalog();
      if (r.permissionsCreated || r.rolesCreated.length) console.log("[permissions] synced", r);
    } catch (e) {
      // The database may not be migrated yet on first boot; the sync runs again on the next start.
      console.warn("[permissions] sync skipped:", (e as Error).message.split("\n")[0]);
    }
  }
}
