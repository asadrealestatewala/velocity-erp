"use server";
import { db } from "@/lib/db";
import { can, dealershipIds, isCentral, requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, forbidden, notFound, runAction } from "@/server/errors";
import { dealershipUserIds, notify } from "@/server/services/notifications";
import { putUpload } from "@/server/storage";
import { dealerDocSchema } from "@/lib/validation-ops";
import { DEALER_DOC_CATEGORY } from "@/lib/ops-constants";

/**
 * One shared document list per dealership. The dealership uploads its own papers (registration certificate, licences…);
 * YADEA staff upload on its behalf or issue achievement certificates. Both sides see the same list.
 */
export async function uploadDealerDocumentAction(dealershipId: string, fd: FormData) {
  return runAction(async () => {
    const user = await requireUser();
    const central = isCentral(user);
    if (central ? !can(user, "dealerdocs.admin") : !can(user, "dealerdocs.upload") || !dealershipIds(user).includes(dealershipId)) throw forbidden();
    const dealership = await db.dealership.findUnique({ where: { id: dealershipId }, select: { id: true, name: true } });
    if (!dealership) throw notFound("Dealership not found.");
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const v = dealerDocSchema.parse(raw);
    // Achievement certificates are issued by YADEA — a dealership can't create its own.
    if (!central && v.category === "ACHIEVEMENT_CERTIFICATE") throw forbidden("Achievement certificates are issued by YADEA.");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a file to upload.", "VALIDATION", { file: "Required" });
    const data = await putUpload(file, { kind: "document", uploadedById: user.id, folder: "dealer-documents" });
    const doc = await db.$transaction(async (tx) => {
      const stored = await tx.storedFile.create({ data });
      const d = await tx.dealershipDocument.create({
        data: { dealershipId, category: v.category, title: v.title, description: v.description ?? null, fileId: stored.id, source: central ? "YADEA" : "DEALERSHIP", expiresAt: v.expiresAt ?? null, uploadedById: user.id },
      });
      if (central) {
        await notify(tx, {
          userIds: await dealershipUserIds(tx, dealershipId, true),
          type: "DOCUMENT_SHARED",
          title: v.category === "ACHIEVEMENT_CERTIFICATE" ? `New achievement certificate: ${v.title}` : `YADEA shared a document: ${v.title}`,
          body: DEALER_DOC_CATEGORY[v.category],
          link: { portal: "/portal/documents" },
          entityType: "DealershipDocument",
          entityId: d.id,
        });
      }
      await audit({ userId: user.id, dealershipId, action: "dealerdoc.uploaded", entityType: "DealershipDocument", entityId: d.id, changes: { title: v.title, category: v.category, source: d.source } }, tx);
      return d;
    });
    return { ok: true as const, data: { id: doc.id }, message: central ? `Shared with ${dealership.name}.` : "Document uploaded and shared with YADEA." };
  });
}

export async function deleteDealerDocumentAction(documentId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const doc = await db.dealershipDocument.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!doc) throw notFound("Document not found.");
    const central = isCentral(user);
    if (central) {
      if (!can(user, "dealerdocs.admin")) throw forbidden();
    } else {
      // A dealership can only withdraw what it uploaded itself — never a certificate YADEA issued.
      if (!can(user, "dealerdocs.upload") || !dealershipIds(user).includes(doc.dealershipId) || doc.source !== "DEALERSHIP") throw forbidden();
    }
    // Soft delete: the file stays in storage for the audit trail but is no longer listed or downloadable.
    await db.dealershipDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await audit({ userId: user.id, dealershipId: doc.dealershipId, action: "dealerdoc.removed", entityType: "DealershipDocument", entityId: documentId, changes: { title: doc.title } });
    return { ok: true as const, message: "Document removed." };
  });
}
