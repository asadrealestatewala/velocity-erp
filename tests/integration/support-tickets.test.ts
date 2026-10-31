import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { platformDb } from "@/server/platform/client";
import { assignTicket, createTicket, customerReply, setTicketPriority, setTicketStatus, SLA_HOURS, slaState, staffReply } from "@/server/platform/tickets";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const admin = { name: "Sam Support", email: "sam@test.local" };
const clear = async () => { await platformDb().supportTicket.deleteMany({ where: { subject: { startsWith: "T:" } } }); };
beforeEach(clear);
afterAll(clear);

const mk = (over: Partial<Parameters<typeof createTicket>[0]> = {}) => createTicket({ source: "APP", subject: "T: printer", body: "It will not print", requesterEmail: "Cust@Example.com", requesterName: "Cust", ...over });

describe("support tickets", () => {
  it("creates a ticket with the first message and a priority-based deadline", async () => {
    const t = await mk({ priority: "URGENT" });
    expect(t.number).toBeGreaterThan(0);
    expect(t.requesterEmail).toBe("cust@example.com");
    expect(Math.round((t.firstResponseDueAt.getTime() - t.createdAt.getTime()) / 3_600_000)).toBe(SLA_HOURS.URGENT);
    const msgs = await platformDb().ticketMessage.findMany({ where: { ticketId: t.id } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ kind: "CUSTOMER", body: "It will not print" });
  });

  it("rejects empty subjects and bodies", async () => {
    await expect(mk({ subject: " " })).rejects.toThrow(/subject/i);
    await expect(mk({ body: "" })).rejects.toThrow(/describe/i);
  });

  it("a public reply stops the SLA clock and waits on the customer; a note does not", async () => {
    const t = await mk();
    await staffReply(t.id, admin, "Checking the printer config", { internal: true });
    let row = await platformDb().supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.firstResponseAt).toBeNull();
    expect(row.status).toBe("OPEN");
    await staffReply(t.id, admin, "Please try again now.");
    row = await platformDb().supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.firstResponseAt).not.toBeNull();
    expect(row.status).toBe("WAITING_CUSTOMER");
    expect(slaState(row)).toBe("met");
    const kinds = (await platformDb().ticketMessage.findMany({ where: { ticketId: t.id }, orderBy: { at: "asc" } })).map((m) => m.kind);
    expect(kinds).toEqual(["CUSTOMER", "NOTE", "STAFF"]);
  });

  it("a customer reply reopens a resolved ticket", async () => {
    const t = await mk();
    await setTicketStatus(t.id, "RESOLVED");
    expect((await platformDb().supportTicket.findUniqueOrThrow({ where: { id: t.id } })).resolvedAt).not.toBeNull();
    await customerReply(t.id, { name: "Cust", email: "cust@example.com" }, "Still broken");
    const row = await platformDb().supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.status).toBe("OPEN");
    expect(row.resolvedAt).toBeNull();
  });

  it("reports overdue, due-soon and paused states", async () => {
    const now = new Date();
    const base = { status: "OPEN" as const, firstResponseAt: null };
    expect(slaState({ ...base, firstResponseDueAt: new Date(now.getTime() - 1000) }, now)).toBe("overdue");
    expect(slaState({ ...base, firstResponseDueAt: new Date(now.getTime() + 3_600_000) }, now)).toBe("due_soon");
    expect(slaState({ ...base, firstResponseDueAt: new Date(now.getTime() + 10 * 3_600_000) }, now)).toBe("ok");
    expect(slaState({ ...base, status: "RESOLVED", firstResponseDueAt: new Date(now.getTime() - 1000) }, now)).toBe("paused");
  });

  it("changing priority moves the deadline until a reply was sent, and assignment sticks", async () => {
    const t = await mk({ priority: "NORMAL" });
    const urgent = await setTicketPriority(t.id, "URGENT");
    expect(Math.round((urgent.firstResponseDueAt.getTime() - t.createdAt.getTime()) / 3_600_000)).toBe(SLA_HOURS.URGENT);
    await staffReply(t.id, admin, "On it");
    const due = (await platformDb().supportTicket.findUniqueOrThrow({ where: { id: t.id } })).firstResponseDueAt.getTime();
    const low = await setTicketPriority(t.id, "LOW");
    expect(low.firstResponseDueAt.getTime()).toBe(due);
    expect((await assignTicket(t.id, { id: "adm1", name: "Sam" })).assigneeName).toBe("Sam");
    expect((await assignTicket(t.id, null)).assigneeId).toBeNull();
  });
});
