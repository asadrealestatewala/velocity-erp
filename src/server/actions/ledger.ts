"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { postManualEntry, recordDealerPayment, rejectPayment, verifyPayment } from "@/server/services/ledger";
import { centralUserIdsWith, dealershipUserIds, notify } from "@/server/services/notifications";
import { prepareAttachments } from "@/server/uploads";
import { dealerPaymentSchema, ledgerAdjustSchema } from "@/lib/validation-ops";
import { fmtMoney } from "@/lib/utils";

/**
 * A dealership reports a payment to YADEA. The payment is recorded with its proof (a voucher) and sits as "awaiting
 * verification" — it only reduces the balance once procurement has checked the proof and verified it.
 */
export async function recordPaymentAction(dealershipId: string, fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("ledger.pay");
    requireOwnDealership(user, dealershipId);
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const v = dealerPaymentSchema.parse(raw);
    const files = await prepareAttachments(fd, user.id, "vouchers");
    if (files.length === 0) throw new AppError("Attach proof of payment (a bank slip, transfer screenshot or signed receipt).", "VALIDATION", { proof: "Required" });
    const entry = await db.$transaction(async (tx) => {
      const voucher = await tx.expenseVoucher.create({
        data: {
          dealershipId, kind: "PAYMENT_TO_YADEA", voucherDate: v.entryDate, category: "Payment to YADEA", payee: "YADEA", description: v.description ?? null,
          amount: v.amount, currency: v.currency, method: v.method, reference: v.reference ?? null, createdById: user.id,
        },
      });
      for (const f of files) {
        const stored = await tx.storedFile.create({ data: f.data });
        await tx.voucherAttachment.create({ data: { voucherId: voucher.id, fileId: stored.id, kind: f.kind === "OTHER" ? "PROOF_OF_PAYMENT" : f.kind, label: f.label, uploadedById: user.id } });
      }
      const e = await recordDealerPayment(tx, { dealershipId, userId: user.id, amount: v.amount, currency: v.currency, entryDate: v.entryDate, method: v.method, reference: v.reference, description: v.description, orderId: v.orderId, voucherId: voucher.id });
      const d = await tx.dealership.findUniqueOrThrow({ where: { id: dealershipId }, select: { name: true } });
      await notify(tx, {
        userIds: await centralUserIdsWith(tx, "ledger.manage"),
        type: "LEDGER_UPDATE",
        title: `${d.name} reported a payment of ${fmtMoney(v.amount, v.currency)}`,
        body: "Check the proof of payment and verify it in the ledger.",
        link: { central: `/procurement/ledger?dealership=${dealershipId}` },
        entityType: "LedgerEntry",
        entityId: e.id,
      });
      await audit({ userId: user.id, dealershipId, action: "ledger.payment_reported", entityType: "LedgerEntry", entityId: e.id, changes: { amount: v.amount, method: v.method, reference: v.reference ?? null, proofs: files.length } }, tx);
      return e;
    });
    return { ok: true as const, data: { id: entry.id }, message: "Payment recorded — YADEA will verify it against your proof." };
  });
}

async function loadEntry(id: string) {
  const e = await db.ledgerEntry.findUnique({ where: { id }, include: { dealership: { select: { name: true } } } });
  if (!e) throw notFound("Ledger entry not found.");
  return e;
}

export async function verifyPaymentAction(entryId: string) {
  return runAction(async () => {
    const user = await requireUser("ledger.manage");
    const e = await loadEntry(entryId);
    await db.$transaction(async (tx) => {
      await verifyPayment(tx, entryId, user.id);
      await notify(tx, {
        userIds: await dealershipUserIds(tx, e.dealershipId, true),
        type: "LEDGER_UPDATE",
        title: `Your payment of ${fmtMoney(e.credit.toString(), e.currency)} was verified`,
        body: "It has been applied to your account balance.",
        link: { portal: "/portal/ledger" },
        entityType: "LedgerEntry",
        entityId: e.id,
      });
      await audit({ userId: user.id, dealershipId: e.dealershipId, action: "ledger.payment_verified", entityType: "LedgerEntry", entityId: e.id, changes: { amount: Number(e.credit) } }, tx);
    });
    return { ok: true as const, message: `Payment verified — ${e.dealership.name}'s balance updated.` };
  });
}

export async function rejectPaymentAction(entryId: string, reason: string) {
  return runAction(async () => {
    const user = await requireUser("ledger.manage");
    const r = z.string().trim().min(3, "Explain what is wrong with the payment").max(500).parse(reason);
    const e = await loadEntry(entryId);
    await db.$transaction(async (tx) => {
      await rejectPayment(tx, entryId, user.id, r);
      await notify(tx, {
        userIds: await dealershipUserIds(tx, e.dealershipId, true),
        type: "LEDGER_UPDATE",
        title: `Your payment of ${fmtMoney(e.credit.toString(), e.currency)} could not be verified`,
        body: r,
        link: { portal: "/portal/ledger" },
        entityType: "LedgerEntry",
        entityId: e.id,
      });
      await audit({ userId: user.id, dealershipId: e.dealershipId, action: "ledger.payment_rejected", entityType: "LedgerEntry", entityId: e.id, changes: { amount: Number(e.credit), reason: r } }, tx);
    });
    return { ok: true as const, message: "Payment rejected — the dealership has been told why." };
  });
}

/** Procurement/accounts posts an entry directly: opening balance, payment received, credit note, adjustment. */
export async function postLedgerEntryAction(input: z.input<typeof ledgerAdjustSchema>) {
  return runAction(async () => {
    const user = await requireUser("ledger.manage");
    const v = ledgerAdjustSchema.parse(input);
    const d = await db.dealership.findUnique({ where: { id: v.dealershipId }, select: { id: true, name: true } });
    if (!d) throw notFound("Dealership not found.");
    const e = await db.$transaction(async (tx) => {
      const created = await postManualEntry(tx, { dealershipId: v.dealershipId, userId: user.id, type: v.type, direction: v.direction, amount: v.amount, currency: v.currency, entryDate: v.entryDate, reference: v.reference, description: v.description, orderId: v.orderId });
      await audit({ userId: user.id, dealershipId: v.dealershipId, action: "ledger.entry_posted", entityType: "LedgerEntry", entityId: created.id, changes: { type: v.type, direction: v.direction, amount: v.amount, description: v.description } }, tx);
      return created;
    });
    return { ok: true as const, data: { id: e.id }, message: `Entry posted to ${d.name}'s ledger.` };
  });
}
