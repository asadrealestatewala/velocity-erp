"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { dealershipIds, isCentral, requireUser } from "@/server/authz";
import { requireOwnDealership } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, forbidden, notFound, runAction } from "@/server/errors";
import { dealershipUserIds, notify } from "@/server/services/notifications";
import { prepareAttachments } from "@/server/uploads";
import { voucherSchema } from "@/lib/validation-ops";
import { fmtMoney } from "@/lib/utils";

/** Create an expense voucher for the showroom, with receipts / invoices / proofs attached for tax records. */
export async function createVoucherAction(dealershipId: string, fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("vouchers.manage");
    requireOwnDealership(user, dealershipId);
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const v = voucherSchema.parse({ ...raw, kind: "EXPENSE" });
    if (v.taxAmount > v.amount) throw new AppError("The tax amount can't be more than the voucher amount.", "VALIDATION", { taxAmount: "Too high" });
    const files = await prepareAttachments(fd, user.id, "vouchers");
    const voucher = await db.$transaction(async (tx) => {
      const created = await tx.expenseVoucher.create({
        data: { dealershipId, kind: "EXPENSE", voucherDate: v.voucherDate, category: v.category, payee: v.payee ?? null, description: v.description ?? null, amount: v.amount, taxAmount: v.taxAmount, currency: v.currency, method: v.method ?? null, reference: v.reference ?? null, createdById: user.id },
      });
      for (const f of files) {
        const stored = await tx.storedFile.create({ data: f.data });
        await tx.voucherAttachment.create({ data: { voucherId: created.id, fileId: stored.id, kind: f.kind, label: f.label, uploadedById: user.id } });
      }
      await audit({ userId: user.id, dealershipId, action: "voucher.created", entityType: "ExpenseVoucher", entityId: created.id, changes: { number: created.number, amount: v.amount, category: v.category, attachments: files.length } }, tx);
      return created;
    });
    return { ok: true as const, data: { id: voucher.id, number: voucher.number }, message: `Voucher EV-${voucher.number} saved.` };
  });
}

async function ownVoucher(userDealerships: string[], id: string) {
  const v = await db.expenseVoucher.findFirst({ where: { id, dealershipId: { in: userDealerships } } });
  if (!v) throw notFound("Voucher not found.");
  return v;
}

/** Attach more documents to a voucher at any time (proof of payment, proof of invoice, the invoice itself, receipts). */
export async function addVoucherDocumentsAction(voucherId: string, fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("vouchers.manage");
    const v = await ownVoucher(dealershipIds(user), voucherId);
    const files = await prepareAttachments(fd, user.id, "vouchers");
    if (files.length === 0) throw new AppError("Choose at least one file to attach.", "VALIDATION", { file_0: "Required" });
    await db.$transaction(async (tx) => {
      for (const f of files) {
        const stored = await tx.storedFile.create({ data: f.data });
        await tx.voucherAttachment.create({ data: { voucherId, fileId: stored.id, kind: f.kind, label: f.label, uploadedById: user.id } });
      }
      await audit({ userId: user.id, dealershipId: v.dealershipId, action: "voucher.documents_added", entityType: "ExpenseVoucher", entityId: voucherId, changes: { count: files.length, kinds: files.map((f) => f.kind) } }, tx);
    });
    return { ok: true as const, message: `${files.length} document${files.length === 1 ? "" : "s"} attached.` };
  });
}

/** Only while the voucher is still awaiting review — after that the evidence is frozen for the tax record. */
export async function removeVoucherDocumentAction(attachmentId: string) {
  return runAction(async () => {
    const user = await requireUser("vouchers.manage");
    const a = await db.voucherAttachment.findUnique({ where: { id: attachmentId }, include: { voucher: true } });
    if (!a || !dealershipIds(user).includes(a.voucher.dealershipId)) throw notFound("Document not found.");
    if (a.voucher.status !== "SUBMITTED") throw new AppError("Documents on a reviewed voucher can't be removed.", "CONFLICT");
    if (a.voucher.kind === "PAYMENT_TO_YADEA") {
      const count = await db.voucherAttachment.count({ where: { voucherId: a.voucherId } });
      if (count <= 1) throw new AppError("A payment needs at least one proof attached.", "CONFLICT");
    }
    await db.$transaction(async (tx) => {
      await tx.voucherAttachment.delete({ where: { id: attachmentId } });
      await audit({ userId: user.id, dealershipId: a.voucher.dealershipId, action: "voucher.document_removed", entityType: "ExpenseVoucher", entityId: a.voucherId, changes: { kind: a.kind } }, tx);
    });
    return { ok: true as const, message: "Document removed." };
  });
}

/** YADEA accounts approves or rejects an expense voucher. Payment vouchers are decided by verifying the ledger payment. */
export async function reviewVoucherAction(voucherId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  return runAction(async () => {
    const user = await requireUser("vouchers.view_all");
    if (!isCentral(user)) throw forbidden();
    const n = z.string().trim().max(500).optional().parse(note || undefined);
    if (decision === "REJECTED" && !n) throw new AppError("Tell the dealership why it was rejected.", "VALIDATION", { note: "Required" });
    const v = await db.expenseVoucher.findUnique({ where: { id: voucherId } });
    if (!v) throw notFound("Voucher not found.");
    if (v.kind === "PAYMENT_TO_YADEA") throw new AppError("Verify or reject this payment from the ledger — the voucher follows it.", "CONFLICT");
    await db.$transaction(async (tx) => {
      const claimed = await tx.expenseVoucher.updateMany({ where: { id: voucherId, status: "SUBMITTED" }, data: { status: decision, reviewNote: n ?? null, reviewedById: user.id, reviewedAt: new Date() } });
      if (claimed.count !== 1) throw new AppError("This voucher has already been reviewed.", "CONFLICT");
      await notify(tx, {
        userIds: [v.createdById, ...(await dealershipUserIds(tx, v.dealershipId, true))],
        type: "LEDGER_UPDATE",
        title: `Voucher EV-${v.number} (${fmtMoney(v.amount.toString(), v.currency)}) was ${decision === "APPROVED" ? "approved" : "rejected"}`,
        body: n,
        link: { portal: "/portal/vouchers" },
        entityType: "ExpenseVoucher",
        entityId: v.id,
      });
      await audit({ userId: user.id, dealershipId: v.dealershipId, action: decision === "APPROVED" ? "voucher.approved" : "voucher.rejected", entityType: "ExpenseVoucher", entityId: v.id, changes: { number: v.number, note: n ?? null } }, tx);
    });
    return { ok: true as const, message: `Voucher EV-${v.number} ${decision === "APPROVED" ? "approved" : "rejected"}.` };
  });
}

