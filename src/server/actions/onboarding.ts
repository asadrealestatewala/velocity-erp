"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, runAction } from "@/server/errors";
import { assertWithinPlan } from "@/server/platform/guard";
import { findDuplicates, normalizedContactFields } from "@/server/services/contacts";
import { createLead } from "@/server/services/leads";
import { MAX_IMPORT_BYTES, parseCustomerCsv, parseVehicleCsv, type ImportIssue } from "@/lib/dealer-onboarding";

export type ImportSummary = { created: number; skipped: number; issues: ImportIssue[] };

function guardText(csv: string) {
  if (typeof csv !== "string" || csv.length > MAX_IMPORT_BYTES) throw new AppError("That file is too large to import in one go.", "VALIDATION");
}

/** Bulk-record vehicles from a CSV (model, chassis_number, engine_number, color, note). Bad or already-recorded rows are reported, never fatal. */
export async function importVehiclesAction(dealershipId: string, csv: string) {
  return runAction(async () => {
    const user = await requireUser("inventory.manage");
    requireOwnDealership(user, dealershipId);
    guardText(csv);
    const parsed = parseVehicleCsv(csv);
    if (parsed.headerError) throw new AppError(parsed.headerError, "VALIDATION");

    const models = await db.bikeModel.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const byName = new Map(models.map((m) => [m.name.trim().toLowerCase(), m.id]));
    const existing = new Set(
      (await db.vehicle.findMany({ where: { chassisNumber: { in: parsed.rows.map((r) => r.data.chassisnumber) } }, select: { chassisNumber: true } })).map((v) => v.chassisNumber),
    );
    const issues = [...parsed.issues];
    const ready: { line: number; modelId: string; r: (typeof parsed.rows)[number]["data"] }[] = [];
    for (const { line, data } of parsed.rows) {
      const modelId = byName.get(data.model.trim().toLowerCase());
      if (!modelId) issues.push({ line, message: `Unknown model "${data.model}"` });
      else if (existing.has(data.chassisnumber)) issues.push({ line, message: `Chassis ${data.chassisnumber} is already recorded` });
      else ready.push({ line, modelId, r: data });
    }
    if (ready.length) {
      await db.$transaction(async (tx) => {
        await tx.vehicle.createMany({
          data: ready.map(({ modelId, r }) => ({ dealershipId, bikeModelId: modelId, chassisNumber: r.chassisnumber, engineNumber: r.enginenumber, color: r.color, note: r.note, createdById: user.id })),
        });
        await audit({ userId: user.id, dealershipId, action: "vehicle.imported", entityType: "Vehicle", entityId: dealershipId, changes: { count: ready.length } }, tx);
      });
    }
    issues.sort((a, b) => a.line - b.line);
    const summary: ImportSummary = { created: ready.length, skipped: issues.length, issues: issues.slice(0, 50) };
    return { ok: true as const, data: summary, message: `${summary.created} vehicle${summary.created === 1 ? "" : "s"} imported${summary.skipped ? `, ${summary.skipped} skipped` : ""}.` };
  });
}

/** Bulk-add existing customers from a CSV (first_name, last_name, phone, email, address). Each becomes a customer record linked to this dealership; matches on phone/email are skipped. */
export async function importCustomersAction(dealershipId: string, csv: string) {
  return runAction(async () => {
    const user = await requireUser("contacts.create");
    requireOwnDealership(user, dealershipId);
    guardText(csv);
    const parsed = parseCustomerCsv(csv);
    if (parsed.headerError) throw new AppError(parsed.headerError, "VALIDATION");
    await assertWithinPlan("maxContacts", parsed.rows.length);

    const issues = [...parsed.issues];
    let created = 0;
    for (const { line, data } of parsed.rows) {
      const dups = await findDuplicates(db, { phone: data.phone, email: data.email });
      if (dups.length) { issues.push({ line, message: "A contact with this phone or email already exists" }); continue; }
      await db.$transaction(async (tx) => {
        const n = await normalizedContactFields(tx, { phone: data.phone, email: data.email });
        const contact = await tx.contact.create({
          data: { type: "CUSTOMER", firstName: data.firstname, lastName: data.lastname, phone: data.phone, email: data.email, address: data.address, ...n, createdById: user.id, lastActivityAt: new Date() },
        });
        // A customer is only visible in the portal through a lead, so each import carries a walk-in record for this dealership — archived, so imports never inflate pipeline or follow-up numbers.
        const lead = await createLead(tx, { contactId: contact.id, origin: "DEALERSHIP_WALK_IN", originDealershipId: dealershipId, inquiryType: "WALK_IN", createdById: user.id, description: "Imported during dealership onboarding" });
        await tx.lead.update({ where: { id: lead.id }, data: { dealershipId, assignedAt: new Date(), isArchived: true } });
        await tx.leadAssignmentHistory.create({ data: { leadId: lead.id, toDealershipId: dealershipId, type: "MANUAL", reason: "Imported during onboarding", assignedById: user.id } });
      });
      created++;
    }
    await audit({ userId: user.id, dealershipId, action: "contact.imported", entityType: "Dealership", entityId: dealershipId, changes: { count: created } });
    issues.sort((a, b) => a.line - b.line);
    const summary: ImportSummary = { created, skipped: issues.length, issues: issues.slice(0, 50) };
    return { ok: true as const, data: summary, message: `${created} customer${created === 1 ? "" : "s"} imported${summary.skipped ? `, ${summary.skipped} skipped` : ""}.` };
  });
}
