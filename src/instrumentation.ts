// Runs once per server process before any request is handled.
// All business dates (test-drive slots, operating hours, "today" on dashboards) use APP_TIMEZONE.
export async function register() {
  process.env.TZ = process.env.APP_TIMEZONE || "Asia/Karachi";
}
