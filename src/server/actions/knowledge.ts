"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { notFound, runAction } from "@/server/errors";
import { knowledgeSchema, type KnowledgeInput } from "@/lib/validation-ops";

/** Administrator-written answers the assistant can cite alongside the built-in guide. */
export async function saveKnowledgeAction(id: string | null, input: KnowledgeInput) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const v = knowledgeSchema.parse(input);
    if (id) {
      const before = await db.knowledgeEntry.findUnique({ where: { id } });
      if (!before) throw notFound("Entry not found.");
      await db.knowledgeEntry.update({ where: { id }, data: v });
      await audit({ userId: user.id, dealershipId: null, action: "knowledge.updated", entityType: "KnowledgeEntry", entityId: id, changes: { title: v.title, isActive: v.isActive } });
      return { ok: true as const, message: "Knowledge entry saved." };
    }
    const e = await db.knowledgeEntry.create({ data: { ...v, createdById: user.id } });
    await audit({ userId: user.id, dealershipId: null, action: "knowledge.created", entityType: "KnowledgeEntry", entityId: e.id, changes: { title: v.title } });
    return { ok: true as const, message: "Knowledge entry added — the assistant can use it right away." };
  });
}

export async function deleteKnowledgeAction(id: string) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    const e = await db.knowledgeEntry.findUnique({ where: { id } });
    if (!e) throw notFound("Entry not found.");
    await db.knowledgeEntry.delete({ where: { id } });
    await audit({ userId: user.id, dealershipId: null, action: "knowledge.deleted", entityType: "KnowledgeEntry", entityId: id, changes: { title: e.title } });
    return { ok: true as const, message: "Entry deleted." };
  });
}
