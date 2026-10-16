"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit, diff } from "@/server/audit";
import { AppError, runAction } from "@/server/errors";
import { saveUpload } from "@/server/storage";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers and dashes"),
  category: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  specifications: z.record(z.string().trim().min(1).max(60), z.string().trim().max(200)).default({}),
  price: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().nullable()),
  currency: z.string().trim().length(3).default("PKR"),
  availability: z.enum(["AVAILABLE", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED"]),
  displayOrder: z.coerce.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});
export type BikeModelInput = z.input<typeof schema>;

export async function saveBikeModelAction(id: string | null, input: BikeModelInput, fd?: FormData) {
  return runAction(async () => {
    const user = await requireUser("bikemodels.manage");
    const v = schema.parse(input);
    const clash = await db.bikeModel.findFirst({ where: { code: v.code, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That model code is already used.", "CONFLICT", { code: "Already used" });
    let imageFileId: string | undefined;
    const file = fd?.get("image");
    if (file instanceof File && file.size > 0) imageFileId = (await saveUpload(file, { kind: "image", uploadedById: user.id, isPublic: true, folder: "models" })).id;
    if (id) {
      const before = await db.bikeModel.findUniqueOrThrow({ where: { id } });
      // Deactivating keeps all references in historical leads and bookings intact (no deletes).
      await db.bikeModel.update({ where: { id }, data: { ...v, isSeedExample: before.isSeedExample && before.name === v.name && before.code === v.code, ...(imageFileId ? { imageFileId } : {}) } });
      await audit({ userId: user.id, action: "bikemodel.updated", entityType: "BikeModel", entityId: id, changes: diff(before as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>) });
      return { ok: true as const, message: "Model saved." };
    }
    const m = await db.bikeModel.create({ data: { ...v, imageFileId } });
    await audit({ userId: user.id, action: "bikemodel.created", entityType: "BikeModel", entityId: m.id });
    return { ok: true as const, message: "Model created." };
  });
}
