import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-pathname": "/" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.current }));

import { db } from "@/lib/db";
import { contactScope, leadScope, childScope } from "@/server/authz";
import { accessibleContact, accessibleLead } from "@/server/access";
import { assignLeadAction, changeStageAction } from "@/server/actions/leads";
import { addNoteAction, recordPaymentAction } from "@/server/actions/work";
import { createContactAction } from "@/server/actions/contacts";
import { saveUserAction, setRolePermissionsAction } from "@/server/actions/users";
import { updateOwnDealershipAction } from "@/server/actions/portal-settings";
import { GET as exportContacts } from "@/app/api/export/contacts/route";
import { GET as getFile } from "@/app/api/files/[id]/route";
import { createLead } from "@/server/services/leads";
import { assignLead } from "@/server/services/assignment";
import { asUser, buildWorld, type World } from "../support/fixtures";
import type { NextRequest } from "next/server";

let w: World;
let leadA: string, leadB: string, contactA: string, contactB: string, leadARep2: string;

async function makeLead(dealershipId: string, userId: string | null, name: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.contact.create({ data: { firstName: name, phone: `0300${Math.floor(1000000 + Math.random() * 8999999)}` } });
    const l = await createLead(tx, { contactId: c.id, origin: "COMPANY", inquiryType: "MANUAL" });
    await assignLead(tx, { leadId: l.id, dealershipId, userId, type: "MANUAL", assignedById: w.staff.id });
    return { lead: l.id, contact: c.id };
  });
}

beforeEach(async () => {
  w = await buildWorld();
  ({ lead: leadA, contact: contactA } = await makeLead(w.A.id, w.aRep.id, "Alpha"));
  ({ lead: leadARep2 } = await makeLead(w.A.id, w.aRep2.id, "AlphaTwo"));
  ({ lead: leadB, contact: contactB } = await makeLead(w.B.id, w.bRep.id, "Bravo"));
  session.current = null;
});

describe("dealership data isolation", () => {
  it("a dealership manager sees only their dealership's leads and contacts", async () => {
    const u = await asUser(w.aManager.id);
    const leads = await db.lead.findMany({ where: leadScope(u), select: { id: true } });
    expect(leads.map((l) => l.id).sort()).toEqual([leadA, leadARep2].sort());
    const contacts = await db.contact.findMany({ where: contactScope(u), select: { id: true } });
    expect(contacts.map((c) => c.id)).not.toContain(contactB);
  });

  it("cannot open another dealership's lead or contact by ID (reported as not found)", async () => {
    const u = await asUser(w.aManager.id);
    await expect(accessibleLead(u, leadB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(accessibleContact(u, contactB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cannot modify another dealership's lead through server actions", async () => {
    session.current = await asUser(w.aManager.id);
    const r1 = await changeStageAction({ leadId: leadB, stageId: w.stages.CONTACTED! });
    expect(r1.ok).toBe(false);
    const r2 = await addNoteAction(contactB, leadB, { body: "sneaky" });
    expect(r2.ok).toBe(false);
    const r3 = await recordPaymentAction(contactB, { type: "DEPOSIT", amount: 10, currency: "PKR", paymentDate: new Date(), method: "CASH", status: "PAID" });
    expect(r3.ok).toBe(false);
    expect(await db.lead.findUniqueOrThrow({ where: { id: leadB } })).toMatchObject({ stageId: w.stages.NEW });
    expect(await db.note.count()).toBe(0);
  });

  it("a sales rep without 'see all' only sees leads assigned to them", async () => {
    const rep = await asUser(w.aRep.id);
    const leads = await db.lead.findMany({ where: leadScope(rep), select: { id: true } });
    expect(leads.map((l) => l.id)).toEqual([leadA]);
    await db.dealership.update({ where: { id: w.A.id }, data: { repsSeeAllLeads: true } });
    const rep2 = await asUser(w.aRep.id);
    expect(await db.lead.count({ where: leadScope(rep2) })).toBe(2);
  });

  it("child records (notes) of dealership B and central-only notes never reach dealership A", async () => {
    await db.note.create({ data: { contactId: contactB, dealershipId: w.B.id, authorId: w.bManager.id, body: "B private" } });
    await db.note.create({ data: { contactId: contactA, dealershipId: null, authorId: w.staff.id, body: "central only" } });
    await db.note.create({ data: { contactId: contactA, dealershipId: w.A.id, authorId: w.aManager.id, body: "A note" } });
    const u = await asUser(w.aManager.id);
    const notes = await db.note.findMany({ where: childScope(u) });
    expect(notes.map((n) => n.body)).toEqual(["A note"]);
  });

  it("CSV export is limited to the user's scope", async () => {
    session.current = await asUser(w.aManager.id);
    const res = await exportContacts({ nextUrl: new URL("http://x/api/export/contacts") } as unknown as NextRequest);
    const csv = await res.text();
    expect(csv).toContain("Alpha");
    expect(csv).not.toContain("Bravo");
    session.current = await asUser(w.aRep.id); // reps don't hold contacts.export
    expect((await exportContacts({ nextUrl: new URL("http://x/api/export/contacts") } as unknown as NextRequest)).status).toBe(403);
  });

  it("private documents are only downloadable by users who can access the record", async () => {
    const file = await db.storedFile.create({ data: { storageKey: "nope/x.pdf", originalName: "x.pdf", mimeType: "application/pdf", size: 1, checksum: "c" } });
    await db.document.create({ data: { contactId: contactB, dealershipId: w.B.id, fileId: file.id, name: "ID", uploadedById: w.bManager.id } });
    session.current = await asUser(w.aManager.id);
    const res = await getFile({ nextUrl: new URL("http://x") } as unknown as NextRequest, { params: Promise.resolve({ id: file.id }) });
    expect(res.status).toBe(404);
    session.current = null;
    expect((await getFile({ nextUrl: new URL("http://x") } as unknown as NextRequest, { params: Promise.resolve({ id: file.id }) })).status).toBe(404);
  });
});

describe("assignment authority", () => {
  it("a dealership manager can assign within their team but not move leads to another dealership", async () => {
    session.current = await asUser(w.aManager.id);
    const ok = await assignLeadAction({ leadId: leadA, dealershipId: w.A.id, userId: w.aRep2.id });
    expect(ok.ok).toBe(true);
    const bad = await assignLeadAction({ leadId: leadA, dealershipId: w.B.id, userId: null });
    expect(bad.ok).toBe(false);
    const foreignRep = await assignLeadAction({ leadId: leadA, dealershipId: w.A.id, userId: w.bRep.id });
    expect(foreignRep.ok).toBe(false);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadA } })).assignedUserId).toBe(w.aRep2.id);
  });

  it("a sales rep cannot reassign leads", async () => {
    session.current = await asUser(w.aRep.id);
    expect((await assignLeadAction({ leadId: leadA, dealershipId: w.A.id, userId: w.aRep2.id })).ok).toBe(false);
  });

  it("YADEA staff can reassign between dealerships and the history is preserved", async () => {
    session.current = await asUser(w.staff.id);
    const r = await assignLeadAction({ leadId: leadA, dealershipId: w.B.id, userId: w.bRep.id, reason: "Customer moved" });
    expect(r.ok).toBe(true);
    const hist = await db.leadAssignmentHistory.findMany({ where: { leadId: leadA }, orderBy: { createdAt: "asc" } });
    expect(hist).toHaveLength(2);
    expect(hist[1]).toMatchObject({ fromDealershipId: w.A.id, toDealershipId: w.B.id, fromUserId: w.aRep.id, toUserId: w.bRep.id, type: "MANUAL", reason: "Customer moved", assignedById: w.staff.id });
    // A loses access, B gains it
    await expect(accessibleLead(await asUser(w.aManager.id), leadA)).rejects.toBeTruthy();
    await expect(accessibleLead(await asUser(w.bManager.id), leadA)).resolves.toBeTruthy();
    // Both dealerships' managers were notified
    const notified = new Set((await db.notification.findMany({ where: { entityId: leadA } })).map((n) => n.userId));
    expect(notified.has(w.bManager.id) && notified.has(w.aManager.id)).toBe(true);
  });

  it("refuses to assign to a dealership that is not accepting leads", async () => {
    await db.dealership.update({ where: { id: w.K.id }, data: { acceptsLeads: false } });
    session.current = await asUser(w.staff.id);
    const r = await assignLeadAction({ leadId: leadB, dealershipId: w.K.id });
    expect(r.ok).toBe(false);
  });
});

describe("privilege escalation", () => {
  it("users cannot change their own role or edit their own role's permissions", async () => {
    // Give a CRM staff member users.manage to test the self-protection rules.
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "users.manage" } });
    await db.rolePermission.create({ data: { roleId: w.roles.CRM_STAFF!, permissionId: perm.id } });
    session.current = await asUser(w.staff.id);
    const self = await saveUserAction(w.staff.id, { name: "staff", email: "staff@test.local", roleId: w.roles.MANAGEMENT! });
    expect(self.ok).toBe(false);
    const own = await setRolePermissionsAction(w.roles.CRM_STAFF!, ["settings.manage"]);
    expect(own.ok).toBe(false);
    const superUp = await saveUserAction(null, { name: "x", email: "x@test.local", roleId: w.roles.SUPER_ADMIN! });
    expect(superUp.ok).toBe(false);
    const beyond = await setRolePermissionsAction(w.roles.MANAGEMENT!, ["settings.manage"]); // staff doesn't hold it
    expect(beyond.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: w.staff.id } })).roleId).toBe(w.roles.CRM_STAFF);
  });

  it("dealership roles can't be granted organisation-wide permissions", async () => {
    session.current = await asUser(w.admin.id);
    const r = await setRolePermissionsAction(w.roles.DEALER_MANAGER!, ["portal.access", "leads.view_all"]);
    expect(r.ok).toBe(false);
  });

  it("users without users.manage are refused on the server", async () => {
    session.current = await asUser(w.aManager.id);
    expect((await saveUserAction(null, { name: "x", email: "y@test.local", roleId: w.roles.CRM_STAFF! })).ok).toBe(false);
    session.current = null;
    const anon = await saveUserAction(null, { name: "x", email: "z@test.local", roleId: w.roles.CRM_STAFF! });
    expect(anon).toMatchObject({ ok: false, error: expect.stringMatching(/session/i) });
  });

  it("a dealership manager can only edit their own dealership's settings", async () => {
    session.current = await asUser(w.aManager.id);
    const payload = { contactName: "x", phone: null, email: null, repsSeeAllLeads: true, testDriveSlotCapacity: 1, operatingHours: {} };
    expect((await updateOwnDealershipAction(w.B.id, payload)).ok).toBe(false);
    expect((await updateOwnDealershipAction(w.A.id, payload)).ok).toBe(true);
  });
});

describe("walk-in leads", () => {
  it("a rep's walk-in is categorised as dealership walk-in, owned by them and invisible to other dealerships", async () => {
    session.current = await asUser(w.aRep.id);
    const r = await createContactAction({
      contact: { firstName: "Walker", phone: "0345 9876543", consentMarketing: false, communicationPrefs: {}, customFields: {}, type: "LEAD" },
      lead: { createLead: true, inquiryType: "WALK_IN" },
    });
    expect(r.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow({ where: { contact: { firstName: "Walker" } } });
    expect(lead).toMatchObject({ origin: "DEALERSHIP_WALK_IN", originDealershipId: w.A.id, dealershipId: w.A.id, assignedUserId: w.aRep.id, inquiryType: "WALK_IN" });
    expect(await db.lead.count({ where: { AND: [{ id: lead.id }, leadScope(await asUser(w.bManager.id))] } })).toBe(0);
  });
});
