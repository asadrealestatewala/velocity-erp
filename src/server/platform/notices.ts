import "server-only";
import { platformDb } from "./client";

/** Each reminder is recorded first (unique key per workspace), so running a job twice, or two instances at once, can never email twice. */
export async function noticeOnce(tenantId: string, key: string): Promise<boolean> {
  const r = await platformDb().lifecycleNotice.createMany({ data: [{ tenantId, key }], skipDuplicates: true });
  return r.count === 1;
}
