import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { db } from "@/lib/db";
import { runDataQuery } from "@/server/assistant/data-query";
import { toolsFor } from "@/server/assistant/tools";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { submitStockOrder } from "@/server/services/procurement";
import { normalizePhone } from "@/lib/utils";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
let proc: { id: string };
let bike: { id: string };

type NewContact = { name: string; email?: string | null; type?: "LEAD" | "CUSTOMER"; cityId?: string | null };
/** A contact with one lead, optionally assigned to a dealership. */
async function contact(dealershipId: string | null, userId: string | null, c: NewContact) {
  return db.$transaction(async (tx) => {
    const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;
    const row = await tx.contact.create({
      data: { firstName: c.name, phone, phoneNormalized: normalizePhone(phone), email: c.email === undefined ? undefined : c.email, emailNormalized: c.email ? c.email.toLowerCase() : undefined, type: c.type ?? "LEAD", cityId: c.cityId ?? undefined },
    });
    const lead = await createLead(tx, { contactId: row.id, origin: "COMPANY", inquiryType: "MANUAL" });
    if (dealershipId) await assignLead(tx, { leadId: lead.id, dealershipId, userId, type: "MANUAL", assignedById: w.staff.id });
    return { contact: row.id, lead: lead.id };
  });
}

beforeEach(async () => {
  w = await buildWorld();
  proc = await db.user.create({ data: { email: "proc@test.local", name: "Procurement", passwordHash: "x", roleId: w.roles.PROCUREMENT! } });
  bike = await db.bikeModel.update({ where: { id: w.m1.id }, data: { name: "GT70", code: "GT70", price: 250000, dealerPrice: 200000 } });
});

describe("the data query engine", () => {
  it("counts only what the user's role may see", async () => {
    await contact(w.A.id, w.aRep.id, { name: "Alpha" });
    await contact(w.A.id, w.aRep.id, { name: "Beta" });
    await contact(w.B.id, w.bRep.id, { name: "Bravo" });
    expect((await runDataQuery(await asUser(w.aManager.id), { entity: "contacts" })).matching).toBe(2);
    expect((await runDataQuery(await asUser(w.bManager.id), { entity: "contacts" })).matching).toBe(1);
    expect((await runDataQuery(await asUser(w.staff.id), { entity: "contacts" })).matching).toBe(3);
    // a dealership can't reach another dealership's records by naming it
    const other = await runDataQuery(await asUser(w.aManager.id), { entity: "contacts", filters: [{ field: "dealership", op: "eq", value: "Dealer B" }] });
    expect(other.matching).toBe(0);
  });

  it("answers 'how many customers have an email' — filters on type and on having a value", async () => {
    await contact(w.A.id, w.aRep.id, { name: "A1", type: "CUSTOMER", email: "a1@example.com" });
    await contact(w.A.id, w.aRep.id, { name: "A2", type: "CUSTOMER" });
    await contact(w.A.id, w.aRep.id, { name: "A3", type: "CUSTOMER", email: "" }); // an empty string counts as "no email"
    await contact(w.A.id, w.aRep.id, { name: "A4", type: "LEAD", email: "a4@example.com" });
    const u = await asUser(w.aManager.id);
    const withEmail = await runDataQuery(u, { entity: "contacts", filters: [{ field: "type", op: "eq", value: "customer" }, { field: "email", op: "not_null" }] });
    expect(withEmail.matching).toBe(1);
    expect(withEmail.filters).toEqual(["type = customer", "email is set"]);
    const without = await runDataQuery(u, { entity: "contacts", filters: [{ field: "type", op: "eq", value: "CUSTOMER" }, { field: "email", op: "is_null" }] });
    expect(without.matching).toBe(2);
    const all = await runDataQuery(u, { entity: "contacts", filters: [{ field: "type", op: "eq", value: "CUSTOMER" }] });
    expect(all.matching).toBe(3);
  });

  it("groups, sums and averages over the records in scope", async () => {
    await db.ledgerEntry.createMany({
      data: [
        { dealershipId: w.A.id, type: "INVOICE", description: "i1", debit: 1000, recordedById: proc.id },
        { dealershipId: w.A.id, type: "INVOICE", description: "i2", debit: 2500, recordedById: proc.id },
        { dealershipId: w.B.id, type: "INVOICE", description: "i3", debit: 9000, recordedById: proc.id },
      ],
    });
    const head = await asUser(proc.id);
    const byDealer = await runDataQuery(head, { entity: "ledger", group_by: "dealership", metric: "sum", metric_field: "debit" });
    expect(byDealer.groups).toEqual([{ key: "Dealer B", value: 9000 }, { key: "Dealer A", value: 3500 }]);
    expect((await runDataQuery(head, { entity: "ledger", metric: "avg", metric_field: "debit", filters: [{ field: "dealership", op: "eq", value: "dealer a" }] })).metric?.value).toBe(1750);
    // a dealership only ever totals its own account
    const mine = await runDataQuery(await asUser(w.aManager.id), { entity: "ledger", metric: "sum", metric_field: "debit" });
    expect(mine.metric?.value).toBe(3500);
    expect(mine.matching).toBe(2);
    // counts by a relation field and by month
    await contact(w.A.id, w.aRep.id, { name: "L1", cityId: w.lahore.id });
    await contact(w.A.id, w.aRep.id, { name: "L2", cityId: w.lahore.id });
    await contact(w.A.id, w.aRep.id, { name: "K1", cityId: w.karachi.id });
    await contact(w.A.id, w.aRep.id, { name: "N1" });
    const byCity = await runDataQuery(await asUser(w.aManager.id), { entity: "contacts", group_by: "city" });
    expect(byCity.groups).toEqual([{ key: "Lahore", value: 2 }, { key: "(none)", value: 1 }, { key: "Karachi", value: 1 }].sort((a, c) => c.value - a.value || a.key.localeCompare(c.key)));
    const byMonth = await runDataQuery(await asUser(w.aManager.id), { entity: "contacts", group_by: "created_at", bucket: "month" });
    expect(byMonth.groups).toHaveLength(1);
    expect(byMonth.groups![0]).toMatchObject({ value: 4 });
  });

  it("understands dates, natural enum words and lists records with a link", async () => {
    const { contact: id } = await contact(w.A.id, w.aRep.id, { name: "Recent", email: "r@example.com" });
    const u = await asUser(w.aManager.id);
    expect((await runDataQuery(u, { entity: "contacts", filters: [{ field: "created_at", op: "gte", value: "today" }] })).matching).toBe(1);
    expect((await runDataQuery(u, { entity: "contacts", filters: [{ field: "created_at", op: "lt", value: "2000-01-01" }] })).matching).toBe(0);
    expect((await runDataQuery(u, { entity: "contacts", filters: [{ field: "created_at", op: "gte", value: "7_days_ago" }] })).matching).toBe(1);
    expect((await runDataQuery(u, { entity: "contacts", filters: [{ field: "created_at", op: "lte", value: "today" }] })).matching).toBe(1); // “on or before today” includes today
    const rows = await runDataQuery(u, { entity: "contacts", show_rows: true, columns: ["first_name", "email"], limit: 5 });
    expect(rows.rows).toEqual([{ first_name: "Recent", email: "r@example.com", link: `/portal/contacts/${id}` }]);

    await db.inventoryItem.create({ data: { dealershipId: w.A.id, bikeModelId: bike.id, quantity: 5 } });
    await db.$transaction((tx) => submitStockOrder(tx, { dealershipId: w.A.id, userId: w.aManager.id, priority: "URGENT", lines: [{ itemKey: `B:${bike.id}`, quantity: 2 }] }));
    // the app calls SUBMITTED “Received” — both words work
    expect((await runDataQuery(u, { entity: "stock_orders", filters: [{ field: "status", op: "eq", value: "received" }] })).matching).toBe(1);
    expect((await runDataQuery(u, { entity: "stock_orders", filters: [{ field: "status", op: "in", value: ["Approved", "Delivered"] }] })).matching).toBe(0);
    expect((await runDataQuery(u, { entity: "stock_orders", filters: [{ field: "priority", op: "eq", value: "urgent" }] })).matching).toBe(1);
    expect((await runDataQuery(u, { entity: "stock_orders", metric: "max", metric_field: "submitted_at" })).metric?.value).toMatch(/\d{4}/);
  });

  it("refuses clearly: unknown fields, bad values, wrong operators and entities the role can't open", async () => {
    const mgr = await asUser(w.aManager.id);
    await expect(runDataQuery(mgr, { entity: "contacts", filters: [{ field: "passwordHash", op: "eq", value: "x" }] })).rejects.toThrow(/no field “passwordHash”.*Fields:/);
    await expect(runDataQuery(mgr, { entity: "nonsense" })).rejects.toThrow(/Unknown entity/);
    await expect(runDataQuery(mgr, { entity: "contacts", filters: [{ field: "type", op: "eq", value: "robot" }] })).rejects.toThrow(/Valid values: LEAD, CUSTOMER/);
    await expect(runDataQuery(mgr, { entity: "contacts", filters: [{ field: "email", op: "gt", value: "a" }] })).rejects.toThrow(/can't be used on email/);
    await expect(runDataQuery(mgr, { entity: "ledger", metric: "sum" })).rejects.toThrow(/needs metric_field/);
    // dealership users can't query head-office-only entities; a rep without ledger access can't query the ledger
    await expect(runDataQuery(mgr, { entity: "users" })).rejects.toThrow(/doesn't have access to users/);
    await expect(runDataQuery(mgr, { entity: "dealerships" })).rejects.toThrow(/doesn't have access to dealerships/);
    await expect(runDataQuery(await asUser(w.aRep.id), { entity: "ledger" })).rejects.toThrow(/doesn't have access to ledger/);
    await expect(runDataQuery(await asUser(w.staff.id), { entity: "customer_orders" })).rejects.toThrow(/doesn't have access/);
  });

  it("never exposes the head-office actor in a dealership's audit log, and honours audit scope", async () => {
    await db.auditLog.create({ data: { userId: w.staff.id, action: "inventory.adjusted", entityType: "InventoryItem", dealershipId: w.A.id } });
    await db.auditLog.create({ data: { userId: w.staff.id, action: "inventory.adjusted", entityType: "InventoryItem", dealershipId: w.B.id } });
    const mgr = await asUser(w.aManager.id);
    expect((await runDataQuery(mgr, { entity: "audit_log" })).matching).toBe(1);
    await expect(runDataQuery(mgr, { entity: "audit_log", show_rows: true, columns: ["action", "user"] })).rejects.toThrow(/no field “user”/);
    const head = await asUser(w.admin.id);
    expect((await runDataQuery(head, { entity: "audit_log", filters: [{ field: "action", op: "contains", value: "adjusted" }] })).matching).toBe(2);
    expect((await runDataQuery(head, { entity: "audit_log", show_rows: true, columns: ["action", "user"], limit: 1 })).rows![0]).toHaveProperty("user");
  });

  it("is offered to every assistant user as a read tool and runs through the same checks", async () => {
    await contact(w.A.id, w.aRep.id, { name: "Tooled" });
    const user = await asUser(w.aManager.id);
    const tool = toolsFor(user).find((t) => t.name === "query_data")!;
    expect(tool).toBeDefined();
    expect(tool.kind).toBe("read");
    expect(tool.description).toMatch(/Entities and their fields/);
    const parsed = tool.input.safeParse({ entity: "contacts", filters: [{ field: "first_name", op: "contains", value: "tool" }] });
    expect(parsed.success).toBe(true);
    expect(await tool.run!(user, parsed.data as never)).toMatchObject({ entity: "contacts", matching: 1 });
    expect(tool.input.safeParse({ entity: "contacts", filters: [{ field: "x", op: "drop table" }] }).success).toBe(false);
  });
});
