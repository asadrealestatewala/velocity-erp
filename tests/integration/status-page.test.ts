import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { currentStatus, openIncidents, recentIncidents } from "@/server/platform/status";
import { savePlatformSettings } from "@/server/platform/settings";

const clean = () => platformDb().statusIncident.deleteMany({});
beforeEach(clean);
afterAll(async () => { await clean(); await savePlatformSettings({ maintenance: { on: false, message: "" } }); });

describe("public status", () => {
  it("is operational when nothing is wrong", async () => {
    await savePlatformSettings({ maintenance: { on: false, message: "" } });
    const s = await currentStatus();
    expect(s.overall).toBe("ok");
    expect(s.components.every((c) => c.level === "ok")).toBe(true);
  });
  it("reports maintenance mode as degraded saving, with the message", async () => {
    await savePlatformSettings({ maintenance: { on: true, message: "Back at 3pm" } });
    const s = await currentStatus();
    expect(s.overall).toBe("degraded");
    expect(s.components.find((c) => c.key === "edit")).toMatchObject({ level: "degraded", note: "Back at 3pm" });
  });
  it("an open minor incident degrades, a major one is an outage, resolved ones do not count", async () => {
    await savePlatformSettings({ maintenance: { on: false, message: "" } });
    const minor = await platformDb().statusIncident.create({ data: { title: "Slow exports", body: "Exports take longer", impact: "minor" } });
    expect((await currentStatus()).overall).toBe("degraded");
    await platformDb().statusIncident.create({ data: { title: "Payments down", body: "Cannot pay", impact: "major" } });
    expect((await currentStatus()).overall).toBe("down");
    await platformDb().statusIncident.updateMany({ data: { resolvedAt: new Date() } });
    expect((await currentStatus()).overall).toBe("ok");
    expect(await openIncidents()).toHaveLength(0);
    expect((await recentIncidents()).map((i) => i.id)).toContain(minor.id);
  });
  it("lists only recently resolved incidents in the history", async () => {
    const now = new Date();
    await platformDb().statusIncident.create({ data: { title: "Old", body: "x y z a b", startedAt: new Date(now.getTime() - 60 * 86_400_000), resolvedAt: new Date(now.getTime() - 59 * 86_400_000) } });
    await platformDb().statusIncident.create({ data: { title: "Recent", body: "x y z a b", startedAt: new Date(now.getTime() - 2 * 86_400_000), resolvedAt: new Date(now.getTime() - 86_400_000) } });
    expect((await recentIncidents(30, now)).map((i) => i.title)).toEqual(["Recent"]);
  });
});
