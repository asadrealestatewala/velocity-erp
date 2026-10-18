"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit, diff } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { saveUpload } from "@/server/storage";
import { productSchema } from "@/lib/validation-ops";

/** Create or edit a spare part (catalogue managers only). Prices are whatever the administrator enters — never invented. */
export async function saveProductAction(id: string | null, input: z.input<typeof productSchema>, fd?: FormData) {
  return runAction(async () => {
    const user = await requireUser("catalog.manage");
    const v = productSchema.parse(input);
    const clash = await db.product.findFirst({ where: { sku: { equals: v.sku, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError("That SKU is already used.", "CONFLICT", { sku: "Already used" });
    let imageFileId: string | undefined;
    const file = fd?.get("image");
    if (file instanceof File && file.size > 0) imageFileId = (await saveUpload(file, { kind: "image", uploadedById: user.id, isPublic: true, folder: "products" })).id;
    if (id) {
      const before = await db.product.findUnique({ where: { id } });
      if (!before) throw notFound("Part not found.");
      await db.product.update({ where: { id }, data: { ...v, isSeedExample: before.isSeedExample && before.name === v.name && before.sku === v.sku, ...(imageFileId ? { imageFileId } : {}) } });
      await audit({ userId: user.id, dealershipId: null, action: "product.updated", entityType: "Product", entityId: id, changes: diff(before as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>) });
      return { ok: true as const, message: "Spare part saved." };
    }
    const p = await db.product.create({ data: { ...v, imageFileId } });
    await audit({ userId: user.id, dealershipId: null, action: "product.created", entityType: "Product", entityId: p.id, changes: { sku: v.sku, name: v.name } });
    return { ok: true as const, message: "Spare part added to the catalogue." };
  });
}

/** What dealers pay YADEA for a bike model, and its suggested retail price. */
export async function setBikePricesAction(id: string, input: { price: number | null; dealerPrice: number | null }) {
  return runAction(async () => {
    const user = await requireUser("catalog.manage");
    const v = z
      .object({
        price: z.number().nonnegative().max(1_000_000_000).nullable(),
        dealerPrice: z.number().nonnegative().max(1_000_000_000).nullable(),
      })
      .parse(input);
    const before = await db.bikeModel.findUnique({ where: { id } });
    if (!before) throw notFound("Model not found.");
    await db.bikeModel.update({ where: { id }, data: v });
    await audit({ userId: user.id, dealershipId: null, action: "bikemodel.prices_updated", entityType: "BikeModel", entityId: id, changes: diff(before as unknown as Record<string, unknown>, v) });
    return { ok: true as const, message: `${before.name}: prices saved.` };
  });
}
