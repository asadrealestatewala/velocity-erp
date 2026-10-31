import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { csvCell, toCsv } from "@/lib/csv";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("@/server/platform/admin-auth", () => ({
  requireAdminAction: async () => ({ id: "a1", email: "owner@test.dev", role: "OWNER" }),
  platformAudit: async () => {},
}));
vi.mock("@/server/platform/plan-mail", () => ({ sendPlanEmail: async () => {} }));

const { bulkExtendTrialAction } = await import("@/server/actions/platform-bulk");
const { tenantWhere } = await import("@/server/platform/tenant-list");

const P = "t-bulk-";
const day = 86_400_000;
const mk = (n: string, o: Record<string, unknown> = {}) =>
  platformDb().tenant.create({ data: { slug: `${P}${n}`, name: `Bulk ${n}`, dbSchema: `t_bulk_${n}`, ownerEmail: `${n}@bulk.test`, ownerEmailHash: `bh-${n}`, status: "ACTIVE", ...o } as never });
const clean = async () => {
  await platformDb().subscriptionHistory.deleteMany({ where: { tenant: { slug: { startsWith: P } } } });
  await platformDb().tenant.deleteMany({ where: { slug: { startsWith: P } } });
};
beforeEach(clean);
afterAll(clean);

describe("CSV", () => {
  it("quotes special characters and neutralises formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
  it("writes a header and CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, "x y"], [2, ""]])).toBe("a,b\r\n1,x y\r\n2,\r\n");
  });
});

describe("list filter", () => {
  it("ignores an unknown status and searches name, code and owner email", () => {
    expect(tenantWhere(null, "NOPE")).toEqual({});
    expect(tenantWhere(null, "ACTIVE")).toEqual({ subStatus: "ACTIVE" });
    expect(JSON.stringify(tenantWhere("acme", null))).toContain("ownerEmail");
  });
});

describe("bulk trial extension", () => {
  it("extends trials only, leaves others alone, and records history", async () => {
    const end = new Date(Date.now() + 3 * day);
    const a = await mk("a", { subStatus: "TRIALING", trialEndsAt: end });
    const b = await mk("b", { subStatus: "TRIALING", trialEndsAt: end });
    const c = await mk("c", { subStatus: "ACTIVE" });
    const r = await bulkExtendTrialAction({ ids: [a.id, b.id, c.id], days: 7, reason: "Onboarding delay" });
    expect(r).toMatchObject({ ok: true });
    expect((r as { message: string }).message).toContain("Extended 2 trials");
    expect((r as { message: string }).message).toContain(c.slug);
    for (const t of [a, b]) {
      const row = await platformDb().tenant.findUniqueOrThrow({ where: { id: t.id } });
      expect(row.trialEndsAt!.getTime()).toBe(end.getTime() + 7 * day);
      expect(await platformDb().subscriptionHistory.count({ where: { tenantId: t.id } })).toBe(1);
    }
    expect((await platformDb().tenant.findUniqueOrThrow({ where: { id: c.id } })).subStatus).toBe("ACTIVE");
    expect(await platformDb().subscriptionHistory.count({ where: { tenantId: c.id } })).toBe(0);
  });
  it("validates input", async () => {
    expect(await bulkExtendTrialAction({ ids: [], days: 7, reason: "ok ok" })).toMatchObject({ ok: false });
    expect(await bulkExtendTrialAction({ ids: ["x"], days: 0, reason: "ok ok" })).toMatchObject({ ok: false });
    expect(await bulkExtendTrialAction({ ids: ["x"], days: 7, reason: "" })).toMatchObject({ ok: false });
    expect(await bulkExtendTrialAction({ ids: Array.from({ length: 51 }, (_, i) => `i${i}`), days: 7, reason: "ok ok" })).toMatchObject({ ok: false });
  });
});
