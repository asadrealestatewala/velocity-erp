import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { can, childScope, contactScope, dealershipIds, isCentral } from "@/server/authz";
import { storage } from "@/server/storage";

/** A file is served only if the requester can access a record that references it. */
async function canAccess(user: CurrentUser | null, fileId: string) {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  if (file.isPublic) return file;
  if (!user) return null;

  const avatar = await db.contact.findFirst({ where: { AND: [{ avatarFileId: fileId }, contactScope(user)] }, select: { id: true } });
  if (avatar) return file;

  if (can(user, "documents.view")) {
    const doc = await db.document.findFirst({
      where: { AND: [{ fileId, deletedAt: null }, childScope(user), { contact: contactScope(user) }] },
      select: { id: true },
    });
    if (doc) return file;
  }
  if (isCentral(user) && (can(user, "applications.view") || can(user, "submissions.view"))) {
    const appDoc = can(user, "applications.view") ? await db.dealershipApplicationDocument.findFirst({ where: { fileId }, select: { id: true } }) : null;
    const subDoc = can(user, "submissions.view") ? await db.formSubmissionFile.findFirst({ where: { fileId }, select: { id: true } }) : null;
    if (appDoc || subDoc) return file;
  }

  // Dealership documents (registration papers, certificates): the dealership's own users and YADEA document admins.
  const dealerDoc = await db.dealershipDocument.findFirst({ where: { fileId, deletedAt: null }, select: { dealershipId: true } });
  if (dealerDoc) {
    if (isCentral(user) ? can(user, "dealerdocs.admin") || can(user, "dealerships.view") : dealershipIds(user).includes(dealerDoc.dealershipId) && can(user, "dealerdocs.upload")) return file;
  }
  // Voucher evidence (receipts, invoices, proof of payment): the dealership's finance users and YADEA accounts.
  const voucherDoc = await db.voucherAttachment.findFirst({ where: { fileId }, select: { voucher: { select: { dealershipId: true } } } });
  if (voucherDoc) {
    const dealershipId = voucherDoc.voucher.dealershipId;
    if (isCentral(user) ? can(user, "vouchers.view_all") || can(user, "ledger.manage") : dealershipIds(user).includes(dealershipId) && (can(user, "vouchers.manage") || can(user, "ledger.pay"))) return file;
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const file = await canAccess(user, id);
  // 404 for both missing and forbidden, so file IDs can't be probed.
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await storage().get(file.storageKey);
    const inline = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf";
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${inline && !download ? "inline" : "attachment"}; filename="${encodeURIComponent(file.originalName)}"`,
        "Cache-Control": file.isPublic ? "public, max-age=86400" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
