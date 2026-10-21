import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { addTeamMemberAction, updateMembershipAction } from "@/server/actions/team";
import { saveBikeModelAction } from "@/server/actions/bike-models";
import { saveProductAction } from "@/server/actions/catalog";
import { leadScope, contactScope, dealershipIds, managedDealershipIds, can } from "@/server/authz";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { DEFAULT_ROLES, DEALER_ONLY_PERMISSIONS } from "@/lib/permissions";
import { normalizePhone } from "@/lib/utils";
import { asUser, buildWorld, type World } from "../support/fixtures";

let w: World;
const as = async (id: string) => { session.current = await asUser(id); return session.current!; };

async function leadAt(dealershipId: string, name: string) {
  return db.$transaction(async (tx) => {
    const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;
    const c = await tx.contact.create({ data: { firstName: name, phone, phoneNormalized: normalizePhone(phone) } });
    const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "MANUAL" });
    await assignLead(tx, { leadId: l.id, dealershipId, userId: null, type: "MANUAL", assignedById: w.staff.id });
    return { contact: c.id, lead: l.id };
  });
}

/** A Dealerships Head who oversees the given dealerships. */
async function head(email: string, dealershipIds: string[]) {
  const u = await db.user.create({ data: { email, name: email.split("@")[0]!, passwordHash: "x", roleId: w.roles.DEALERSHIP_HEAD! } });
  for (const dealershipId of dealershipIds) await db.dealershipMembership.create({ data: { userId: u.id, dealershipId, role: "MANAGER" } });
  return u;
}

beforeEach(async () => {
  w = await buildWorld();
  session.current = null;
});

describe("Dealerships Head", () => {
  it("has a dealership-scoped role with the same powers as a manager, and no head-office permissions", () => {
    const manager = DEFAULT_ROLES.find((r) => r.key === "DEALER_MANAGER")!;
    const headRole = DEFAULT_ROLES.find((r) => r.key === "DEALERSHIP_HEAD")!;
    expect(headRole.scope).toBe("DEALERSHIP");
    expect([...headRole.permissions].sort()).toEqual([...manager.permissions].sort());
    for (const p of headRole.permissions) expect(["dashboard.view", "users.manage", "settings.manage", "dealerships.manage", "leads.assign"], p).not.toContain(p);
    // every dealership-only permission a manager holds, a head holds too
    for (const p of DEALER_ONLY_PERMISSIONS.filter((x) => manager.permissions.includes(x))) expect(headRole.permissions, p).toContain(p);
  });

  it("sees and works the leads of every dealership they head — and of no other", async () => {
    await leadAt(w.A.id, "AtA");
    await leadAt(w.B.id, "AtB");
    await leadAt(w.K.id, "AtK");
    const h = await head("head.north@test.local", [w.A.id, w.K.id]);
    const user = await asUser(h.id);
    expect(dealershipIds(user).sort()).toEqual([w.A.id, w.K.id].sort());
    expect(managedDealershipIds(user)).toHaveLength(2);
    const leads = await db.lead.findMany({ where: leadScope(user), include: { contact: true } });
    expect(leads.map((l) => l.contact.firstName).sort()).toEqual(["AtA", "AtK"]);
    expect(await db.contact.count({ where: contactScope(user) })).toBe(2);
    // the outlet's own manager is unaffected and still sees only their outlet
    expect(await db.lead.count({ where: leadScope(await asUser(w.aManager.id)) })).toBe(1);
    // a head can act as a manager: assign leads to reps and manage the team of their dealerships
    expect(can(user, "leads.assign_team")).toBe(true);
    expect(can(user, "team.manage")).toBe(true);
    expect(can(user, "procurement.order")).toBe(true);
    expect(can(user, "dashboard.view")).toBe(false);
  });

  it("is appointed by head office, never by a dealership manager, and keeps the head role when added to more dealerships", async () => {
    // a dealership manager cannot appoint a head
    await as(w.aManager.id);
    expect((await addTeamMemberAction({ dealershipId: w.A.id, email: "x.head@test.local", name: "X Head", role: "HEAD" })).ok).toBe(false);

    // head office appoints a new head for dealership A: new dealership account with the Head role and a manager membership
    await as(w.admin.id);
    const created = await addTeamMemberAction({ dealershipId: w.A.id, email: "new.head@test.local", name: "New Head", role: "HEAD" });
    expect(created).toMatchObject({ ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { email: "new.head@test.local" }, include: { role: true, memberships: true } });
    expect(u.role.key).toBe("DEALERSHIP_HEAD");
    expect(u.mustChangePassword).toBe(true);
    expect(u.memberships).toMatchObject([{ dealershipId: w.A.id, role: "MANAGER" }]);

    // …then added to a second dealership (as head or as manager): still a head, now over two dealerships
    expect((await addTeamMemberAction({ dealershipId: w.K.id, email: "new.head@test.local", name: "New Head", role: "MANAGER" })).ok).toBe(true);
    expect((await addTeamMemberAction({ dealershipId: w.B.id, email: "new.head@test.local", name: "New Head", role: "HEAD" })).ok).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { email: "new.head@test.local" }, include: { role: true, memberships: true } });
    expect(after.role.key).toBe("DEALERSHIP_HEAD");
    expect(after.memberships).toHaveLength(3);

    // changing a membership never downgrades a head
    const m = after.memberships.find((x) => x.dealershipId === w.K.id)!;
    expect((await updateMembershipAction(m.id, { role: "MANAGER" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "new.head@test.local" }, include: { role: true } })).role.key).toBe("DEALERSHIP_HEAD");

    // an ordinary rep promoted to manager still becomes a Dealership Manager (existing behaviour)
    expect((await addTeamMemberAction({ dealershipId: w.A.id, email: "a.rep@test.local", name: "a.rep", role: "MANAGER" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "a.rep@test.local" }, include: { role: true } })).role.key).toBe("DEALER_MANAGER");
  });
});

describe("Procurement department owns the product catalogue", () => {
  it("can add and edit bike models as well as spare parts and dealer prices — and nobody else outside head office's admins can", async () => {
    const proc = await db.user.create({ data: { email: "proc@test.local", name: "Procurement", passwordHash: "x", roleId: w.roles.PROCUREMENT! } });
    await as(proc.id);
    const user = session.current!;
    expect(can(user, "bikemodels.manage")).toBe(true);
    expect(can(user, "catalog.manage")).toBe(true);
    const created = await saveBikeModelAction(null, { name: "Keeness 2", code: "KEEN-2", availability: "AVAILABLE", specifications: {}, price: null, currency: "PKR", displayOrder: 0, isActive: true });
    expect(created).toMatchObject({ ok: true });
    const model = await db.bikeModel.findUniqueOrThrow({ where: { code: "KEEN-2" } });
    expect((await saveBikeModelAction(model.id, { name: "Keeness 2 Pro", code: "KEEN-2", availability: "COMING_SOON", specifications: {}, price: null, currency: "PKR", displayOrder: 0, isActive: true })).ok).toBe(true);
    expect((await db.bikeModel.findUniqueOrThrow({ where: { id: model.id } })).name).toBe("Keeness 2 Pro");
    expect((await saveProductAction(null, { sku: "TYRE-1", name: "Tyre", category: "Tyres", unit: "pcs", price: null, dealerPrice: 1000, isActive: true })).ok).toBe(true);
    // the audit trail records who changed the catalogue
    expect(await db.auditLog.count({ where: { userId: proc.id, action: { in: ["bikemodel.created", "bikemodel.updated"] } } })).toBe(2);

    // sales & CRM staff and dealership users cannot change bike models
    for (const id of [w.staff.id, w.aManager.id]) {
      await as(id);
      expect((await saveBikeModelAction(null, { name: "Nope", code: "NOPE", availability: "AVAILABLE", specifications: {}, price: null, currency: "PKR", displayOrder: 0, isActive: true })).ok).toBe(false);
    }
    expect(await db.bikeModel.count({ where: { code: "NOPE" } })).toBe(0);
  });
});
