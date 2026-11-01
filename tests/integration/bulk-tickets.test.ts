import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { parseListParams } from "@/components/ui/table";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("@/server/platform/admin-auth", () => ({
  requireAdminAction: async () => ({ id: "a-bulk-t", name: "Bulk Tester", email: "owner@test.dev", role: "OWNER" }),
  platformAudit: async () => {},
}));

const { bulkUpdateTicketsAction } = await import("@/server/actions/platform-bulk");

const mk = (subject: string, o: Record<string, unknown> = {}) =>
  platformDb().supportTicket.create({ data: { subject: `bulk-t ${subject}`, requesterEmail: "c@bulk.test", firstResponseDueAt: new Date(Date.now() + 86_400_000), ...o } as never });
const clean = () => platformDb().supportTicket.deleteMany({ where: { subject: { startsWith: "bulk-t " } } });
beforeEach(clean);
afterAll(clean);

describe("list paging params", () => {
  it("clamps page and page size and computes skip", () => {
    expect(parseListParams({ page: "3", pageSize: "10" })).toMatchObject({ page: 3, pageSize: 10, skip: 20 });
    expect(parseListParams({ page: "-4", pageSize: "100000" })).toMatchObject({ page: 1, pageSize: 100, skip: 0 });
    expect(parseListParams({}, { pageSize: 50 }).pageSize).toBe(50);
  });
});

describe("bulk ticket actions", () => {
  it("resolves ticked tickets, skips ones already resolved, and reopens them", async () => {
    const a = await mk("a");
    const b = await mk("b", { status: "RESOLVED" });
    const r = await bulkUpdateTicketsAction({ ids: [a.id, b.id], action: "resolve" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toContain("Resolved 1 ticket");
    expect((await platformDb().supportTicket.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("RESOLVED");
    await bulkUpdateTicketsAction({ ids: [a.id], action: "reopen" });
    const again = await platformDb().supportTicket.findUniqueOrThrow({ where: { id: a.id } });
    expect(again.status).toBe("OPEN");
    expect(again.resolvedAt).toBeNull();
  });

  it("assigns ticked tickets to the signed-in person and rejects empty or unknown input", async () => {
    const a = await mk("c");
    await platformDb().platformAdmin.upsert({ where: { id: "a-bulk-t" }, update: {}, create: { id: "a-bulk-t", email: "bulk-t@test.local", name: "Bulk Tester", role: "OWNER", passwordHash: "x" } as never }).catch(() => {});
    const r = await bulkUpdateTicketsAction({ ids: [a.id], action: "assign-me" });
    expect(r.ok).toBe(true);
    expect((await platformDb().supportTicket.findUniqueOrThrow({ where: { id: a.id } })).assigneeName).toBe("Bulk Tester");
    expect((await bulkUpdateTicketsAction({ ids: [], action: "resolve" })).ok).toBe(false);
    expect((await bulkUpdateTicketsAction({ ids: ["nope"], action: "resolve" })).ok).toBe(false);
    await platformDb().platformAdmin.deleteMany({ where: { id: "a-bulk-t" } });
  });
});
