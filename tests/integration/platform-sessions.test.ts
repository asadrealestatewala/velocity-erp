import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformDb } from "@/server/platform/client";
import { describeAgent, listSessions, revokeSession, revokeSessions } from "@/server/platform/sessions";

const mk = (email: string) => platformDb().platformAdmin.create({ data: { email, name: "T", passwordHash: "x" } });
let a = "";
let b = "";

beforeAll(async () => {
  await platformDb().platformAdmin.deleteMany({ where: { email: { in: ["t-sess-a@test.local", "t-sess-b@test.local"] } } });
  a = (await mk("t-sess-a@test.local")).id;
  b = (await mk("t-sess-b@test.local")).id;
  const exp = new Date(Date.now() + 3_600_000);
  await platformDb().platformSession.createMany({
    data: [
      { id: "t-sess-a1", adminId: a, expiresAt: exp, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537" },
      { id: "t-sess-a2", adminId: a, expiresAt: exp, lastSeenAt: new Date(Date.now() + 5000) },
      { id: "t-sess-a3", adminId: a, expiresAt: new Date(Date.now() - 1000) },
      { id: "t-sess-b1", adminId: b, expiresAt: exp },
    ],
  });
});
afterAll(async () => {
  await platformDb().platformAdmin.deleteMany({ where: { id: { in: [a, b] } } });
});

describe("staff session management", () => {
  it("lists only live sessions, most recently active first", async () => {
    const rows = await listSessions(a);
    expect(rows.map((r) => r.id)).toEqual(["t-sess-a2", "t-sess-a1"]);
  });
  it("cannot revoke another admin's session", async () => {
    expect(await revokeSession(a, "t-sess-b1")).toBe(false);
    expect(await platformDb().platformSession.count({ where: { id: "t-sess-b1" } })).toBe(1);
    expect(await revokeSession(a, "t-sess-a1")).toBe(true);
  });
  it("signs out everywhere except the kept session", async () => {
    await platformDb().platformSession.create({ data: { id: "t-sess-a4", adminId: a, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await revokeSessions(a, "t-sess-a2")).toBe(2); // a4 and the expired a3
    expect((await listSessions(a)).map((r) => r.id)).toEqual(["t-sess-a2"]);
    expect(await revokeSessions(a)).toBe(1);
    expect(await platformDb().platformSession.count({ where: { adminId: b } })).toBe(1);
  });
  it("describes browsers readably", () => {
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe("Chrome on Windows");
    expect(describeAgent(null)).toBe("Unknown device");
  });
});
