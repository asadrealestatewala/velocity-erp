import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { clearActivityThrottle, getCohorts, getFunnel, touchActivity } from "@/server/platform/growth";
import { inSegment, optOut, sendCampaign, unsubscribeUrl, verifyUnsubscribe } from "@/server/platform/campaigns";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const P = "t-growth-";
const day = 86_400_000;
const mk = (n: string, o: Record<string, unknown> = {}) =>
  platformDb().tenant.create({ data: { slug: `${P}${n}`, name: `Co ${n}`, dbSchema: `t_${P.replace(/-/g, "_")}${n}`, ownerName: `Owner ${n}`, ownerEmail: `${n}@growth.test`, ownerEmailHash: `h-${n}`, emailConfirmedAt: new Date(), status: "ACTIVE", subStatus: "ACTIVE", ...o } as never });

async function cleanup() {
  await platformDb().campaign.deleteMany({ where: { name: { startsWith: "T " } } });
  await platformDb().mailMessage.deleteMany({ where: { toAddress: { endsWith: "@growth.test" } } });
  await platformDb().tenant.deleteMany({ where: { slug: { startsWith: P } } });
}
beforeEach(async () => { await cleanup(); clearActivityThrottle(); });
afterAll(cleanup);

describe("segments", () => {
  const base = { id: "x", slug: "x", name: "X", ownerName: "A", ownerEmail: "a@x.test", subStatus: "ACTIVE", trialEndsAt: null, lastSeenAt: null, createdAt: new Date("2026-01-01"), status: "ACTIVE", marketingOptOutAt: null } as const;
  const now = new Date("2026-06-01");
  it("never includes opted-out, suspended or address-less workspaces", () => {
    expect(inSegment({ ...base, marketingOptOutAt: now }, "active", now)).toBe(false);
    expect(inSegment({ ...base, status: "SUSPENDED" }, "active", now)).toBe(false);
    expect(inSegment({ ...base, ownerEmail: null }, "active", now)).toBe(false);
    expect(inSegment(base, "active", now)).toBe(true);
  });
  it("selects trials ending within seven days, not later or already over", () => {
    const t = { ...base, subStatus: "TRIALING" } as const;
    expect(inSegment({ ...t, trialEndsAt: new Date(now.getTime() + 3 * day) }, "trialEnding", now)).toBe(true);
    expect(inSegment({ ...t, trialEndsAt: new Date(now.getTime() + 9 * day) }, "trialEnding", now)).toBe(false);
    expect(inSegment({ ...t, trialEndsAt: new Date(now.getTime() - day) }, "trialEnding", now)).toBe(false);
  });
  it("treats never-seen workspaces as last seen at sign-up for inactivity", () => {
    expect(inSegment(base, "inactive", now)).toBe(true);
    expect(inSegment({ ...base, lastSeenAt: new Date(now.getTime() - 2 * day) }, "inactive", now)).toBe(false);
  });
});

describe("unsubscribe links", () => {
  it("accept only the signature made for that workspace", () => {
    const sig = unsubscribeUrl("tenant-1").split("/").pop()!;
    expect(verifyUnsubscribe("tenant-1", sig)).toBe(true);
    expect(verifyUnsubscribe("tenant-2", sig)).toBe(false);
    expect(verifyUnsubscribe("tenant-1", sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyUnsubscribe("tenant-1", "")).toBe(false);
  });
});

describe("activity", () => {
  it("records one row per workspace per day and updates last seen", async () => {
    const t = await mk("a");
    await touchActivity(t);
    await touchActivity(t);
    clearActivityThrottle();
    await touchActivity(t);
    expect(await platformDb().tenantActivity.count({ where: { tenantId: t.id } })).toBe(1);
    expect((await platformDb().tenant.findUniqueOrThrow({ where: { id: t.id } })).lastSeenAt).not.toBeNull();
  });
  it("ignores the original install", async () => {
    await touchActivity({ id: "legacy", isLegacy: true });
    expect(await platformDb().tenantActivity.count({ where: { tenantId: "legacy" } })).toBe(0);
  });
});

describe("funnel and retention", () => {
  it("counts each step from real records", async () => {
    const created = new Date(Date.now() - 10 * day);
    const a = await mk("f1", { createdAt: created });
    await mk("f2", { createdAt: created, emailConfirmedAt: null });
    await platformDb().tenantActivity.create({ data: { tenantId: a.id, day: new Date(created.toISOString().slice(0, 10)) } });
    await platformDb().tenantActivity.create({ data: { tenantId: a.id, day: new Date(Date.now() - 5 * day) } });
    const f = await getFunnel(new Date(Date.now() - 20 * day), new Date());
    const n = (k: string) => f.steps.find((s) => s.key === k)!.count;
    expect(n("signedUp")).toBeGreaterThanOrEqual(2);
    expect(n("confirmed")).toBe(n("signedUp") - 1);
    expect(n("returned")).toBe(1);
    expect(n("paid")).toBe(0);
  });
  it("measures retention from each workspace's own sign-up day", async () => {
    const now = new Date();
    const created = new Date(now.getTime() - 15 * day);
    const a = await mk("r1", { createdAt: created });
    const b = await mk("r2", { createdAt: created });
    const d0 = new Date(created.toISOString().slice(0, 10));
    await platformDb().tenantActivity.createMany({ data: [{ tenantId: a.id, day: d0 }, { tenantId: b.id, day: d0 }, { tenantId: a.id, day: new Date(d0.getTime() + 8 * day) }] });
    const rows = await getCohorts(8, now);
    const row = rows.find((r) => r.weekStart <= created.toISOString().slice(0, 10) && new Date(r.weekStart).getTime() + 7 * day > created.getTime())!;
    expect(row.retention[0]).toBe(1);
    expect(row.retention[1]).toBe(0.5);
  });
});

describe("sending a campaign", () => {
  it("reaches the segment once, skips opted-out owners, and cannot be sent twice", async () => {
    await mk("s1");
    await mk("s2");
    const out = await mk("s3");
    await mk("s4", { subStatus: "TRIALING" });
    await optOut(out.id);
    const c = await platformDb().campaign.create({ data: { name: "T one", subject: "Hello {{name}}", body: "Hi {{company}}\n\nNews.", segment: "active", createdBy: "test" } });
    const first = await sendCampaign(c.id);
    expect(first).not.toBe("already-sent");
    const row = await platformDb().campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.recipients).toBe(2);
    expect(row.sentAt).not.toBeNull();
    const mails = await platformDb().mailMessage.findMany({ where: { templateKey: `campaign:${c.id}` } });
    expect(mails.map((m) => m.toAddress).sort()).toEqual(["s1@growth.test", "s2@growth.test"]);
    expect(mails[0]!.bodyText).toContain("/unsubscribe/");
    expect(await sendCampaign(c.id)).toBe("already-sent");
    expect(await platformDb().mailMessage.count({ where: { templateKey: `campaign:${c.id}` } })).toBe(2);
  });
  it("opting out sets the date only once", async () => {
    const t = await mk("o1");
    await optOut(t.id, new Date("2026-02-01"));
    await optOut(t.id, new Date("2026-03-01"));
    expect((await platformDb().tenant.findUniqueOrThrow({ where: { id: t.id } })).marketingOptOutAt?.toISOString()).toContain("2026-02-01");
  });
});
