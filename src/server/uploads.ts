import "server-only";
import type { VoucherDocKind } from "@prisma/client";
import { AppError } from "@/server/errors";
import { putUpload } from "@/server/storage";

const KINDS = ["PROOF_OF_PAYMENT", "PROOF_OF_INVOICE", "INVOICE", "RECEIPT", "OTHER"] as const;
export const MAX_ATTACHMENTS = 8;

export type PreparedAttachment = { data: Awaited<ReturnType<typeof putUpload>>; kind: VoucherDocKind; label: string | null };

/**
 * Reads `file_0..file_7` (+ `kind_N`, `label_N`) from a FormData, validates each by content signature and writes the
 * bytes to storage. The caller creates the StoredFile / attachment rows inside its own transaction.
 */
export async function prepareAttachments(fd: FormData, uploadedById: string, folder: string): Promise<PreparedAttachment[]> {
  const out: PreparedAttachment[] = [];
  for (let i = 0; i < MAX_ATTACHMENTS; i++) {
    const f = fd.get(`file_${i}`);
    if (!(f instanceof File) || f.size === 0) continue;
    const kindRaw = String(fd.get(`kind_${i}`) ?? "OTHER");
    if (!(KINDS as readonly string[]).includes(kindRaw)) throw new AppError("Unknown document type.");
    const label = String(fd.get(`label_${i}`) ?? "").trim().slice(0, 120) || null;
    out.push({ data: await putUpload(f, { kind: "document", uploadedById, folder }), kind: kindRaw as VoucherDocKind, label });
  }
  return out;
}
