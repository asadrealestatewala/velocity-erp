import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { announcementsFor, clearAnnouncementCache, selectAnnouncements } from "@/server/platform/announcements";

const t = { id: "tenant-a", planKey: "growth" };
const row = (o: Partial<Parameters<typeof selectAnnouncements>[0][number]> & { id: string }) => ({ title: o.id, body: "b", tone: "info", planKey: null, tenantId: null, ...o });

describe("selecting announcements", () => {
  it("applies audience: everyone, a plan, or one workspace", () => {
    const rows = [row({ id: "all" }), row({ id: "growth", planKey: "growth" }), row({ id: "other-plan", planKey: "enterprise" }), row({ id: "me", tenantId: "tenant-a" }), row({ id: "someone-else", tenantId: "tenant-b" })];
    expect(selectAnnouncements(rows, t).map((a) => a.id).sort()).toEqual(["all", "growth", "me"]);
  });
  it("shows the most urgent first and at most three", () => {
    const rows = [row({ id: "i1" }), row({ id: "w", tone: "warn" }), row({ id: "d", tone: "danger" }), row({ id: "i2" })];
    expect(selectAnnouncements(rows, t).map((a) => a.id)).toEqual(["d", "w", "i1"]);
  });
  it("treats an unknown tone as information", () => {
    expect(selectAnnouncements([row({ id: "x", tone: "weird" })], t)[0]!.tone).toBe("info");
  });
});

describe("announcements from the database", () => {
  beforeEach(async () => { await platformDb().announcement.deleteMany({}); clearAnnouncementCache(); });
  afterAll(async () => { await platformDb().announcement.deleteMany({}); clearAnnouncementCache(); });
  const day = 86_400_000;

  it("honours the active flag and the start/end window", async () => {
    const now = new Date();
    await platformDb().announcement.createMany({ data: [
      { title: "live", body: "b", endsAt: new Date(now.getTime() + day) },
      { title: "off", body: "b", isActive: false },
      { title: "future", body: "b", startsAt: new Date(now.getTime() + day) },
      { title: "ended", body: "b", startsAt: new Date(now.getTime() - 3 * day), endsAt: new Date(now.getTime() - day) },
      { title: "no end", body: "b" },
    ] });
    const titles = (await announcementsFor(t, new Date(Date.now() + 1000))).map((a) => a.title).sort();
    expect(titles).toEqual(["live", "no end"]);
  });
});
